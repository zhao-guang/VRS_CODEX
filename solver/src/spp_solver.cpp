#include "spp_solver.hpp"

#include "coordinates.hpp"
#include "rinex_reader.hpp"
#include "time_system.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <limits>
#include <map>
#include <optional>
#include <set>
#include <stdexcept>
#include <string>
#include <tuple>
#include <utility>
#include <vector>

using json = nlohmann::json;
using namespace gnss;

namespace {

constexpr double kPi = 3.141592653589793238462643383279502884;
constexpr double kMu = 3.986005e14;
constexpr double kOmegaEarth = 7.2921151467e-5;
constexpr double kC = 299792458.0;
constexpr double kFRel = -4.442807633e-10;

struct SatelliteSolution {
  std::string prn;
  double pseudorange{};
  double residual{};
  double elevation_deg{};
  double azimuth_deg{};
  double clock_seconds{};
  Vec3 position{};
};

struct EpochSolution {
  bool success{false};
  std::string error;
  Vec3 receiver{};
  std::string solved_epoch;
  std::vector<SatelliteSolution> used_satellites;
  double sigma0{};
  double pdop{};
  double hdop{};
  double vdop{};
};

struct AttemptDiagnostics {
  std::string epoch_time;
  double elevation_mask_deg{};
  std::string error;
  int used_satellites{};
};

struct SppModelOptions {
  bool use_ionosphere{true};
  bool use_troposphere{true};
};

struct PseudorangeSelection {
  double value{};
  std::string observation_code;
};

using Matrix = std::vector<std::vector<double>>;

std::string system_name(char system) {
  switch (system) {
    case 'G':
      return "GPS";
    case 'E':
      return "GAL";
    case 'C':
      return "BDS";
    case 'R':
      return "GLO";
    default:
      return "UNK";
  }
}

double clamp(double value, double lower, double upper) {
  return std::max(lower, std::min(upper, value));
}

double tropospheric_delay_saastamoinen(const Vec3& receiver, double elevation_deg) {
  if (!std::isfinite(elevation_deg)) {
    return 0.0;
  }
  const auto geodetic = ecef_to_geodetic(receiver);
  const double height = std::max(-100.0, geodetic[2]);
  const double elevation_rad = deg_to_rad(std::max(3.0, elevation_deg));
  const double pressure = 1013.25 * std::pow(1.0 - 2.2557e-5 * height, 5.2568);
  const double temperature = 288.15 - 0.0065 * height;
  const double humidity = 50.0;
  const double water_vapor =
      humidity / 100.0 * 6.108 * std::exp((17.15 * (temperature - 273.15)) / (234.7 + (temperature - 273.15)));
  const double zenith = kPi / 2.0 - elevation_rad;
  return 0.002277 / std::cos(zenith) *
         (pressure + (1255.0 / temperature + 0.05) * water_vapor - std::pow(std::tan(zenith), 2.0));
}

double ionospheric_delay_klobuchar(const Vec3& receiver, double elevation_deg, double azimuth_deg, const GpsTime& rx_time,
                                   const std::optional<std::array<double, 4>>& alpha,
                                   const std::optional<std::array<double, 4>>& beta) {
  if (!alpha.has_value() || !beta.has_value() || !std::isfinite(elevation_deg) || !std::isfinite(azimuth_deg)) {
    return 0.0;
  }
  const auto geodetic = ecef_to_geodetic(receiver);
  const double lat_sc = geodetic[0] / 180.0;
  const double lon_sc = geodetic[1] / 180.0;
  const double elev_sc = elevation_deg / 180.0;
  const double azimuth_rad = deg_to_rad(azimuth_deg);

  const double psi = 0.0137 / (elev_sc + 0.11) - 0.022;
  double phi_i = lat_sc + psi * std::cos(azimuth_rad);
  phi_i = clamp(phi_i, -0.416, 0.416);
  const double lambda_i = lon_sc + psi * std::sin(azimuth_rad) / std::cos(phi_i * kPi);
  const double phi_m = phi_i + 0.064 * std::cos((lambda_i - 1.617) * kPi);

  double local_time = 43200.0 * lambda_i + rx_time.tow;
  while (local_time >= 86400.0) {
    local_time -= 86400.0;
  }
  while (local_time < 0.0) {
    local_time += 86400.0;
  }

  const auto& a = alpha.value();
  const auto& b = beta.value();
  double amplitude = a[0] + a[1] * phi_m + a[2] * phi_m * phi_m + a[3] * phi_m * phi_m * phi_m;
  double period = b[0] + b[1] * phi_m + b[2] * phi_m * phi_m + b[3] * phi_m * phi_m * phi_m;
  amplitude = std::max(0.0, amplitude);
  period = std::max(72000.0, period);

  const double phase = 2.0 * kPi * (local_time - 50400.0) / period;
  const double mapping = 1.0 + 16.0 * std::pow(0.53 - elev_sc, 3.0);
  double delay_seconds = 5.0e-9;
  if (std::abs(phase) < 1.57) {
    delay_seconds += amplitude * (1.0 - phase * phase / 2.0 + std::pow(phase, 4.0) / 24.0);
  }
  return kC * mapping * delay_seconds;
}
std::optional<PseudorangeSelection> select_pseudorange(const ObservationRecord& observation) {
  std::vector<std::string> preferred;
  if (!observation.satellite.empty() && observation.satellite[0] == 'E') {
    preferred = {"C1C", "C1X", "C1A", "C1B", "C1Z"};
  } else {
    preferred = {"C1C", "C1W", "C1P", "C1S", "C1X", "C1L", "C1M", "C1N"};
  }
  for (const auto& code : preferred) {
    auto iterator = observation.values.find(code);
    if (iterator != observation.values.end() && std::isfinite(iterator->second)) {
      return PseudorangeSelection{iterator->second, code};
    }
  }
  return std::nullopt;
}

const BroadcastEphemeris* find_best_ephemeris(const std::vector<BroadcastEphemeris>& ephemerides, const std::string& prn, const GpsTime& time) {
  const BroadcastEphemeris* best = nullptr;
  double best_distance = std::numeric_limits<double>::max();
  for (const auto& eph : ephemerides) {
    if (eph.prn != prn) {
      continue;
    }
    const double distance = std::abs(gps_time_difference(time.tow - eph.toe));
    if (distance < best_distance) {
      best_distance = distance;
      best = &eph;
    }
  }
  return best;
}

std::vector<char> sort_systems(const std::set<char>& systems) {
  const std::array<char, 4> priority = {'G', 'E', 'C', 'R'};
  std::vector<char> ordered;
  ordered.reserve(systems.size());
  for (char system : priority) {
    if (systems.count(system) > 0) {
      ordered.push_back(system);
    }
  }
  for (char system : systems) {
    if (std::find(ordered.begin(), ordered.end(), system) == ordered.end()) {
      ordered.push_back(system);
    }
  }
  return ordered;
}

int system_priority_rank(char system) {
  switch (system) {
    case 'G':
      return 0;
    case 'E':
      return 1;
    case 'C':
      return 2;
    case 'R':
      return 3;
    default:
      return 9;
  }
}

std::vector<char> detect_active_systems(const ObservationEpoch& epoch, const NavDataset& navigation, const GpsTime& rx_time,
                                        const std::set<char>& enabled_systems) {
  std::map<char, int> usable_counts;
  std::set<std::string> processed_prns;
  for (const auto& observation : epoch.observations) {
    if (observation.satellite.empty()) {
      continue;
    }
    const char system = observation.satellite[0];
    if (enabled_systems.count(system) == 0) {
      continue;
    }
    if (!processed_prns.insert(observation.satellite).second) {
      continue;
    }
    if (!select_pseudorange(observation).has_value()) {
      continue;
    }
    if (find_best_ephemeris(navigation.ephemerides, observation.satellite, rx_time) == nullptr) {
      continue;
    }
    usable_counts[system] += 1;
  }

  if (usable_counts.empty()) {
    return {};
  }

  std::vector<std::pair<char, int>> ordered_counts(usable_counts.begin(), usable_counts.end());
  std::sort(ordered_counts.begin(), ordered_counts.end(), [](const auto& lhs, const auto& rhs) {
    if (lhs.second != rhs.second) {
      return lhs.second > rhs.second;
    }
    return system_priority_rank(lhs.first) < system_priority_rank(rhs.first);
  });

  std::vector<char> selected_systems;
  selected_systems.push_back(ordered_counts.front().first);
  for (std::size_t index = 1; index < ordered_counts.size(); ++index) {
    if (ordered_counts[index].second >= 2) {
      selected_systems.push_back(ordered_counts[index].first);
    }
  }
  return selected_systems;
}

std::pair<Vec3, double> satellite_position_and_clock(const BroadcastEphemeris& eph, const GpsTime& transmit_time,
                                                     const std::string& observation_code) {
  const double tk = gps_time_difference(transmit_time.tow - eph.toe);
  const double a = eph.sqrt_a * eph.sqrt_a;
  const double n0 = std::sqrt(kMu / (a * a * a));
  const double n = n0 + eph.delta_n;
  const double m = eph.m0 + n * tk;

  double e = m;
  for (int iteration = 0; iteration < 15; ++iteration) {
    const double next = m + eph.e * std::sin(e);
    if (std::abs(next - e) < 1e-13) {
      e = next;
      break;
    }
    e = next;
  }

  const double sin_v = std::sqrt(1.0 - eph.e * eph.e) * std::sin(e) / (1.0 - eph.e * std::cos(e));
  const double cos_v = (std::cos(e) - eph.e) / (1.0 - eph.e * std::cos(e));
  const double v = std::atan2(sin_v, cos_v);
  const double phi = v + eph.omega;
  const double two_phi = 2.0 * phi;
  const double du = eph.cuc * std::cos(two_phi) + eph.cus * std::sin(two_phi);
  const double dr = eph.crc * std::cos(two_phi) + eph.crs * std::sin(two_phi);
  const double di = eph.cic * std::cos(two_phi) + eph.cis * std::sin(two_phi);

  const double u = phi + du;
  const double r = a * (1.0 - eph.e * std::cos(e)) + dr;
  const double i = eph.i0 + di + eph.idot * tk;
  const double x_prime = r * std::cos(u);
  const double y_prime = r * std::sin(u);
  const double omega = eph.omega0 + (eph.omega_dot - kOmegaEarth) * tk - kOmegaEarth * eph.toe;

  Vec3 position{
      x_prime * std::cos(omega) - y_prime * std::cos(i) * std::sin(omega),
      x_prime * std::sin(omega) + y_prime * std::cos(i) * std::cos(omega),
      y_prime * std::sin(i),
  };

  const GpsTime toc = to_gps_time(eph.toc);
  const double dt = gps_time_difference(transmit_time.tow - toc.tow);
  const double relativity = kFRel * eph.e * eph.sqrt_a * std::sin(e);
  double group_delay = eph.tgd;
  if (eph.system == 'E') {
    if (observation_code.starts_with("C1")) {
      group_delay = std::isfinite(eph.bgd_e5a_e1) ? eph.bgd_e5a_e1 : eph.bgd_e5b_e1;
    }
  }
  const double clock = eph.af0 + eph.af1 * dt + eph.af2 * dt * dt + relativity - group_delay;
  return {position, clock};
}

std::vector<double> solve_linear_system(Matrix matrix, std::vector<double> rhs) {
  const std::size_t size = matrix.size();
  if (size == 0 || rhs.size() != size) {
    throw std::runtime_error("Invalid linear system dimensions.");
  }
  for (const auto& row : matrix) {
    if (row.size() != size) {
      throw std::runtime_error("Linear system matrix must be square.");
    }
  }

  for (std::size_t pivot = 0; pivot < size; ++pivot) {
    std::size_t max_row = pivot;
    for (std::size_t row = pivot + 1; row < size; ++row) {
      if (std::abs(matrix[row][pivot]) > std::abs(matrix[max_row][pivot])) {
        max_row = row;
      }
    }
    std::swap(matrix[pivot], matrix[max_row]);
    std::swap(rhs[pivot], rhs[max_row]);
    const double divisor = matrix[pivot][pivot];
    if (std::abs(divisor) < 1e-12) {
      throw std::runtime_error("Singular normal matrix.");
    }
    for (std::size_t column = pivot; column < size; ++column) {
      matrix[pivot][column] /= divisor;
    }
    rhs[pivot] /= divisor;
    for (std::size_t row = 0; row < size; ++row) {
      if (row == pivot) {
        continue;
      }
      const double factor = matrix[row][pivot];
      for (std::size_t column = pivot; column < size; ++column) {
        matrix[row][column] -= factor * matrix[pivot][column];
      }
      rhs[row] -= factor * rhs[pivot];
    }
  }
  return rhs;
}

Matrix invert_matrix(Matrix matrix) {
  const std::size_t size = matrix.size();
  if (size == 0) {
    throw std::runtime_error("Invalid inverse matrix dimensions.");
  }
  for (const auto& row : matrix) {
    if (row.size() != size) {
      throw std::runtime_error("Inverse matrix must be square.");
    }
  }

  Matrix inv(size, std::vector<double>(size, 0.0));
  for (std::size_t i = 0; i < size; ++i) {
    inv[i][i] = 1.0;
  }
  for (std::size_t pivot = 0; pivot < size; ++pivot) {
    std::size_t max_row = pivot;
    for (std::size_t row = pivot + 1; row < size; ++row) {
      if (std::abs(matrix[row][pivot]) > std::abs(matrix[max_row][pivot])) {
        max_row = row;
      }
    }
    std::swap(matrix[pivot], matrix[max_row]);
    std::swap(inv[pivot], inv[max_row]);
    const double divisor = matrix[pivot][pivot];
    if (std::abs(divisor) < 1e-12) {
      throw std::runtime_error("Singular normal matrix.");
    }
    for (std::size_t column = 0; column < size; ++column) {
      matrix[pivot][column] /= divisor;
      inv[pivot][column] /= divisor;
    }
    for (std::size_t row = 0; row < size; ++row) {
      if (row == pivot) {
        continue;
      }
      const double factor = matrix[row][pivot];
      for (std::size_t column = 0; column < size; ++column) {
        matrix[row][column] -= factor * matrix[pivot][column];
        inv[row][column] -= factor * inv[pivot][column];
      }
    }
  }
  return inv;
}

ObservationEpoch select_epoch(const RinexObservationFile& file, const std::optional<std::string>& requested_time) {
  if (!requested_time.has_value()) {
    return file.epochs.front();
  }
  const DateTime request_time = parse_iso8601_datetime(*requested_time);
  const double target = unix_seconds(request_time);
  const ObservationEpoch* best = &file.epochs.front();
  double best_distance = std::abs(unix_seconds(best->time) - target);
  for (const auto& epoch : file.epochs) {
    const double distance = std::abs(unix_seconds(epoch.time) - target);
    if (distance < best_distance) {
      best_distance = distance;
      best = &epoch;
    }
  }
  return *best;
}

std::vector<std::size_t> build_epoch_search_order(const RinexObservationFile& file, const std::optional<std::string>& requested_time) {
  std::vector<std::size_t> indices(file.epochs.size());
  for (std::size_t index = 0; index < file.epochs.size(); ++index) {
    indices[index] = index;
  }
  if (!requested_time.has_value()) {
    return indices;
  }

  const DateTime request_time = parse_iso8601_datetime(*requested_time);
  const double target = unix_seconds(request_time);
  std::vector<std::size_t> filtered;
  for (std::size_t index : indices) {
    const double distance = std::abs(unix_seconds(file.epochs[index].time) - target);
    if (distance <= 3600.0) {
      filtered.push_back(index);
    }
  }
  if (!filtered.empty()) {
    indices = filtered;
  }
  std::sort(indices.begin(), indices.end(), [&](std::size_t lhs, std::size_t rhs) {
    const double lhs_distance = std::abs(unix_seconds(file.epochs[lhs].time) - target);
    const double rhs_distance = std::abs(unix_seconds(file.epochs[rhs].time) - target);
    if (lhs_distance != rhs_distance) {
      return lhs_distance < rhs_distance;
    }
    return lhs < rhs;
  });
  return indices;
}

std::vector<double> build_elevation_mask_candidates(double requested_mask_deg) {
  const double normalized = std::clamp(requested_mask_deg, 0.0, 30.0);
  std::vector<double> candidates = {normalized};
  for (double candidate = normalized - 5.0; candidate >= 5.0; candidate -= 5.0) {
    if (std::find(candidates.begin(), candidates.end(), candidate) == candidates.end()) {
      candidates.push_back(candidate);
    }
  }
  if (std::find(candidates.begin(), candidates.end(), 5.0) == candidates.end()) {
    candidates.push_back(5.0);
  }
  return candidates;
}

EpochSolution solve_epoch_spp(const ObservationEpoch& epoch, const NavDataset& navigation, const Vec3& initial_receiver,
                              double elevation_mask_deg, const SppModelOptions& options,
                              const std::set<char>& enabled_systems) {
  const GpsTime rx_time = to_gps_time(epoch.time);
  const auto active_systems = detect_active_systems(epoch, navigation, rx_time, enabled_systems);
  if (active_systems.empty()) {
    return {false, "No usable observations with matching broadcast ephemeris were found for the requested constellations.",
            {}, to_iso8601(epoch.time), {}, 0.0, 0.0, 0.0, 0.0};
  }

  std::map<char, std::size_t> clock_columns;
  for (std::size_t index = 0; index < active_systems.size(); ++index) {
    clock_columns[active_systems[index]] = 3 + index;
  }
  const std::size_t state_size = 3 + active_systems.size();
  const std::size_t minimum_observations = state_size + (active_systems.size() > 1 ? 1 : 0);

  Vec3 receiver = initial_receiver;
  std::vector<double> receiver_clock_biases(active_systems.size(), 0.0);
  std::vector<SatelliteSolution> used_satellites;
  std::set<std::string> excluded_prns;

  for (int quality_round = 0; quality_round < 3; ++quality_round) {
    receiver = initial_receiver;
    std::fill(receiver_clock_biases.begin(), receiver_clock_biases.end(), 0.0);

    for (int iteration = 0; iteration < 8; ++iteration) {
      Matrix normal(state_size, std::vector<double>(state_size, 0.0));
      std::vector<double> rhs(state_size, 0.0);
      used_satellites.clear();
      std::set<std::string> processed_prns;

      for (const auto& observation : epoch.observations) {
        if (observation.satellite.empty()) {
          continue;
        }
        const char system = observation.satellite[0];
        if (enabled_systems.count(system) == 0) {
          continue;
        }
        if (excluded_prns.count(observation.satellite) > 0) {
          continue;
        }
        if (!processed_prns.insert(observation.satellite).second) {
          continue;
        }
        const auto clock_column_iterator = clock_columns.find(system);
        if (clock_column_iterator == clock_columns.end()) {
          continue;
        }
        const auto pseudorange = select_pseudorange(observation);
        if (!pseudorange.has_value()) {
          continue;
        }
        const BroadcastEphemeris* eph = find_best_ephemeris(navigation.ephemerides, observation.satellite, rx_time);
        if (eph == nullptr) {
          continue;
        }

        double travel_time = pseudorange->value / kC;
        GpsTime tx_time = rx_time;
        tx_time.tow -= travel_time;
        auto [sat_pos_initial, sat_clock_initial] = satellite_position_and_clock(*eph, tx_time, pseudorange->observation_code);
        const Vec3 delta_initial = sat_pos_initial - receiver;
        travel_time = vector_norm(delta_initial) / kC;
        tx_time = rx_time;
        tx_time.tow -= travel_time;

        auto [sat_position, sat_clock] = satellite_position_and_clock(*eph, tx_time, pseudorange->observation_code);
        sat_position = rotate_earth(sat_position, travel_time);
        const Vec3 delta = sat_position - receiver;
        const double geometric_range = vector_norm(delta);
        if (!std::isfinite(geometric_range) || geometric_range <= 0.0) {
          continue;
        }

        auto [elevation, azimuth] = elevation_azimuth(receiver, sat_position);
        if (std::isfinite(elevation_mask_deg) && elevation < elevation_mask_deg) {
          continue;
        }

        const double tropo_delay = options.use_troposphere ? tropospheric_delay_saastamoinen(receiver, elevation) : 0.0;
        const double iono_delay =
            options.use_ionosphere
                ? ionospheric_delay_klobuchar(receiver, elevation, azimuth, rx_time, navigation.gps_iono_alpha,
                                             navigation.gps_iono_beta)
                : 0.0;

        const double ux = delta.x / geometric_range;
        const double uy = delta.y / geometric_range;
        const double uz = delta.z / geometric_range;
        const std::size_t clock_column = clock_column_iterator->second;
        const double innovation =
            pseudorange->value + kC * sat_clock - tropo_delay - iono_delay -
            (geometric_range + receiver_clock_biases[clock_column - 3]);
        const double weight = std::max(0.05, std::pow(std::sin(deg_to_rad(std::max(5.0, elevation))), 2.0));

        std::vector<double> row(state_size, 0.0);
        row[0] = -ux;
        row[1] = -uy;
        row[2] = -uz;
        row[clock_column] = 1.0;
        for (std::size_t i = 0; i < state_size; ++i) {
          rhs[i] += weight * row[i] * innovation;
          for (std::size_t j = 0; j < state_size; ++j) {
            normal[i][j] += weight * row[i] * row[j];
          }
        }

        used_satellites.push_back(
            {observation.satellite, pseudorange->value, innovation, elevation, azimuth, sat_clock, sat_position});
      }

      if (used_satellites.size() < minimum_observations) {
        return {false,
                active_systems.size() > 1 ? "Not enough pseudorange observations for mixed-constellation SPP."
                                          : "Not enough pseudorange observations for SPP.",
                {},
                to_iso8601(epoch.time),
                {},
                0.0,
                0.0,
                0.0,
                0.0};
      }

      try {
        const auto correction = solve_linear_system(normal, rhs);
        receiver.x += correction[0];
        receiver.y += correction[1];
        receiver.z += correction[2];
        for (std::size_t index = 0; index < active_systems.size(); ++index) {
          receiver_clock_biases[index] += correction[3 + index];
        }
        const double position_delta =
            std::sqrt(correction[0] * correction[0] + correction[1] * correction[1] + correction[2] * correction[2]);
        double max_clock_delta = 0.0;
        for (std::size_t index = 3; index < correction.size(); ++index) {
          max_clock_delta = std::max(max_clock_delta, std::abs(correction[index]));
        }
        if (position_delta < 1e-4 && max_clock_delta < 1e-4) {
          const auto inverse = invert_matrix(normal);
          double residual_sum = 0.0;
          double max_abs_residual = 0.0;
          std::string worst_prn;
          for (const auto& satellite : used_satellites) {
            residual_sum += satellite.residual * satellite.residual;
            const double abs_residual = std::abs(satellite.residual);
            if (abs_residual > max_abs_residual) {
              max_abs_residual = abs_residual;
              worst_prn = satellite.prn;
            }
          }
          const double sigma0 =
              std::sqrt(residual_sum / std::max(1.0, static_cast<double>(used_satellites.size() - state_size)));
          if (used_satellites.size() > minimum_observations && max_abs_residual > 100.0) {
            excluded_prns.insert(worst_prn);
            break;
          }
          const double pdop =
              std::sqrt(std::max(0.0, inverse[0][0] + inverse[1][1] + inverse[2][2]));
          const double hdop = std::sqrt(std::max(0.0, inverse[0][0] + inverse[1][1]));
          const double vdop = std::sqrt(std::max(0.0, inverse[2][2]));
          return {true, "", receiver, to_iso8601(epoch.time), used_satellites, sigma0, pdop, hdop, vdop};
        }
      } catch (const std::exception& exc) {
        return {false, exc.what(), {}, to_iso8601(epoch.time), {}, 0.0, 0.0, 0.0, 0.0};
      }
    }
  }

  return {false, "SPP did not converge after quality control.", {}, to_iso8601(epoch.time), {}, 0.0, 0.0, 0.0, 0.0};
}

json build_failure(const std::string& job_id, const std::string& message) {
  return {
      {"jobId", job_id},
      {"status", "failed"},
      {"engine", "cpp-solver-gps-spp"},
      {"error", message},
      {"summary", {{"mode", "spp"}, {"solutionStatus", "failed"}}},
      {"quality", json::object()},
      {"epochs", json::array()},
      {"satellites", json::array()},
  };
}

json build_failure_with_summary(const std::string& job_id, const std::string& message, const json& summary) {
  return {
      {"jobId", job_id},
      {"status", "failed"},
      {"engine", "cpp-solver-gps-spp"},
      {"error", message},
      {"summary", summary},
      {"quality", json::object()},
      {"epochs", json::array()},
      {"satellites", json::array()},
  };
}

}  // namespace

nlohmann::json solve_spp_request(const nlohmann::json& request) {
  const std::string job_id = request.value("jobId", "spp-job");
  const std::string station_id = request.contains("site") ? request["site"].value("name", "SITE") : "SITE";
  const std::optional<std::string> requested_epoch =
      request.contains("time") && request["time"].contains("epoch") ? std::make_optional(request["time"]["epoch"].get<std::string>()) : std::nullopt;
  const std::string obs_path = request.contains("observation") ? request["observation"].value("filePath", "") : "";
  const double elevation_mask_deg = request.value("elevationMaskDeg", 10.0);
  const std::string ionosphere_model =
      request.contains("models") ? request["models"].value("ionosphere", std::string("broadcast")) : "broadcast";
  const std::string troposphere_model =
      request.contains("models") ? request["models"].value("troposphere", std::string("saastamoinen")) : "saastamoinen";
  std::set<char> enabled_systems = {'G'};
  if (request.contains("constellations") && request["constellations"].is_array()) {
    enabled_systems.clear();
    for (const auto& constellation : request["constellations"]) {
      const std::string value = constellation.get<std::string>();
      if (value == "GPS") {
        enabled_systems.insert('G');
      } else if (value == "GAL") {
        enabled_systems.insert('E');
      } else if (value == "BDS") {
        enabled_systems.insert('C');
      } else if (value == "GLO") {
        enabled_systems.insert('R');
      }
    }
    if (enabled_systems.empty()) {
      enabled_systems.insert('G');
    }
  }
  if (obs_path.empty()) {
    return build_failure(job_id, "Observation file path is required.");
  }
  if (!request.contains("navigation") || request["navigation"].empty()) {
    return build_failure(job_id, "At least one navigation file is required for real SPP.");
  }

  try {
    const RinexObservationFile obs = parse_rinex_observation(obs_path);
    NavDataset navigation;
    for (const auto& nav : request["navigation"]) {
      const auto parsed = parse_rinex_navigation(nav.value("filePath", ""));
      navigation.ephemerides.insert(navigation.ephemerides.end(), parsed.ephemerides.begin(), parsed.ephemerides.end());
      if (!navigation.gps_iono_alpha.has_value() && parsed.gps_iono_alpha.has_value()) {
        navigation.gps_iono_alpha = parsed.gps_iono_alpha;
      }
      if (!navigation.gps_iono_beta.has_value() && parsed.gps_iono_beta.has_value()) {
        navigation.gps_iono_beta = parsed.gps_iono_beta;
      }
    }
    Vec3 initial_receiver{obs.approximate_position_xyz[0], obs.approximate_position_xyz[1], obs.approximate_position_xyz[2]};
    if (!finite_vec3(initial_receiver) && request.contains("approximatePosition")) {
      const auto& approx = request["approximatePosition"];
      if (approx.contains("latitude") && approx.contains("longitude") && approx.contains("height") &&
          !approx["latitude"].is_null() && !approx["longitude"].is_null() && !approx["height"].is_null()) {
        initial_receiver = geodetic_to_ecef(approx["latitude"].get<double>(), approx["longitude"].get<double>(),
                                            approx["height"].get<double>());
      }
    }
    if (!finite_vec3(initial_receiver)) {
      return build_failure(job_id, "No usable approximate receiver position was found.");
    }

    const auto candidate_indices = build_epoch_search_order(obs, requested_epoch);
    const auto mask_candidates = build_elevation_mask_candidates(elevation_mask_deg);
    std::string last_error = "SPP did not converge.";
    std::vector<AttemptDiagnostics> diagnostics;
    const SppModelOptions options{
        ionosphere_model == "broadcast",
        troposphere_model == "saastamoinen",
    };
    bool found_solution = false;
    EpochSolution best_attempt;
    double best_mask = elevation_mask_deg;
    double best_score = std::numeric_limits<double>::max();
    double requested_target_seconds = 0.0;
    if (requested_epoch.has_value()) {
      const DateTime request_time = parse_iso8601_datetime(*requested_epoch);
      requested_target_seconds = unix_seconds(request_time);
    }

    for (double mask_candidate : mask_candidates) {
      for (std::size_t epoch_index : candidate_indices) {
        const auto attempt =
            solve_epoch_spp(obs.epochs[epoch_index], navigation, initial_receiver, mask_candidate, options, enabled_systems);
        diagnostics.push_back(
            {to_iso8601(obs.epochs[epoch_index].time), mask_candidate, attempt.error, static_cast<int>(attempt.used_satellites.size())});
        if (!attempt.success) {
          last_error = attempt.error;
          continue;
        }
        const double position_divergence = distance_between(attempt.receiver, initial_receiver);
        if (position_divergence > 1000.0) {
          diagnostics.back().error = "Candidate solution diverged too far from the approximate receiver position.";
          last_error = diagnostics.back().error;
          continue;
        }
        const double time_distance =
            requested_epoch.has_value() ? std::abs(unix_seconds(obs.epochs[epoch_index].time) - requested_target_seconds) : 0.0;
        const double score = position_divergence + time_distance * 0.2 + attempt.sigma0 * 10.0;
        if (!found_solution || score < best_score) {
          found_solution = true;
          best_attempt = attempt;
          best_mask = mask_candidate;
          best_score = score;
        }
      }
    }

    json failure_summary = {
        {"mode", "spp"},
        {"solutionStatus", "failed"},
        {"stationId", station_id},
        {"requestedEpochTime", requested_epoch.value_or("")},
        {"requestedElevationMaskDeg", elevation_mask_deg},
        {"attemptedMasksDeg", mask_candidates},
        {"candidateEpochCount", static_cast<int>(candidate_indices.size())},
        {"attemptDiagnosticsTotal", static_cast<int>(diagnostics.size())},
        {"constellations", request.contains("constellations") ? request["constellations"] : json::array()},
        {"attemptDiagnostics", json::array()},
    };
    std::set<std::tuple<std::string, double, std::string, int>> seen_diagnostics;
    int emitted_diagnostics = 0;
    for (const auto& item : diagnostics) {
      const auto key = std::make_tuple(item.epoch_time, item.elevation_mask_deg, item.error, item.used_satellites);
      if (!seen_diagnostics.insert(key).second) {
        continue;
      }
      if (emitted_diagnostics >= 20) {
        break;
      }
      failure_summary["attemptDiagnostics"].push_back(
          {{"epochTime", item.epoch_time},
           {"elevationMaskDeg", item.elevation_mask_deg},
           {"error", item.error},
           {"usedSatellites", item.used_satellites}});
      emitted_diagnostics += 1;
    }

    if (found_solution) {
      const auto geodetic = ecef_to_geodetic(best_attempt.receiver);
      json satellites = json::array();
      for (const auto& satellite : best_attempt.used_satellites) {
        satellites.push_back(
            {{"epochTime", best_attempt.solved_epoch},
             {"satelliteSystem", system_name(satellite.prn.empty() ? '?' : satellite.prn[0])},
             {"satellitePrn", satellite.prn},
             {"elevationDeg", satellite.elevation_deg},
             {"azimuthDeg", satellite.azimuth_deg},
             {"snr", nullptr},
             {"usedInSolution", true},
             {"healthStatus", "healthy"},
             {"cycleSlip", false},
             {"codeResidual", satellite.residual},
             {"phaseResidual", nullptr}});
      }
      return {
          {"jobId", job_id},
          {"status", "succeeded"},
          {"engine", "cpp-solver-gps-spp"},
          {"summary",
           {{"mode", "spp"},
            {"stationId", station_id},
            {"epochCount", 1},
            {"validEpochCount", 1},
            {"solutionStatus", "code"},
            {"requestedEpochTime", requested_epoch.value_or(best_attempt.solved_epoch)},
            {"solvedEpochTime", best_attempt.solved_epoch},
            {"requestedElevationMaskDeg", elevation_mask_deg},
            {"appliedElevationMaskDeg", best_mask},
            {"ionosphereModel", ionosphere_model},
            {"troposphereModel", troposphere_model},
            {"nsatUsed", static_cast<int>(best_attempt.used_satellites.size())},
            {"observationFilename", obs_path.substr(obs_path.find_last_of("/\\") + 1)}}},
          {"quality",
           {{"pdop", best_attempt.pdop},
            {"hdop", best_attempt.hdop},
            {"vdop", best_attempt.vdop},
            {"sigma0", best_attempt.sigma0}}},
          {"epochs",
           json::array(
               {{{"epochTime", best_attempt.solved_epoch},
                 {"siteRole", "single"},
                 {"solutionStatus", "code"},
                 {"ecef", {{"x", best_attempt.receiver.x}, {"y", best_attempt.receiver.y}, {"z", best_attempt.receiver.z}}},
                 {"geodetic", {{"latitude", geodetic[0]}, {"longitude", geodetic[1]}, {"height", geodetic[2]}}},
                 {"pdop", best_attempt.pdop},
                 {"hdop", best_attempt.hdop},
                 {"vdop", best_attempt.vdop},
                 {"nsatUsed", static_cast<int>(best_attempt.used_satellites.size())},
                 {"sigma0", best_attempt.sigma0},
                 {"residualSummary", {{"codeRms", best_attempt.sigma0}}}}})},
          {"satellites", satellites},
      };
    }

    return build_failure_with_summary(job_id, last_error, failure_summary);
  } catch (const std::exception& exc) {
    return build_failure(job_id, exc.what());
  }
}
