#include "spp_solver.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdio>
#include <cstdint>
#include <fstream>
#include <iomanip>
#include <limits>
#include <map>
#include <optional>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <tuple>
#include <utility>
#include <vector>

using json = nlohmann::json;

namespace {

constexpr double kPi = 3.141592653589793238462643383279502884;
constexpr double kMu = 3.986005e14;
constexpr double kOmegaEarth = 7.2921151467e-5;
constexpr double kC = 299792458.0;
constexpr double kFRel = -4.442807633e-10;

struct DateTime {
  int year{};
  int month{};
  int day{};
  int hour{};
  int minute{};
  double second{};
};

struct GpsTime {
  int week{};
  double tow{};
};

struct ObservationRecord {
  std::string satellite;
  std::map<std::string, double> values;
};

struct ObservationEpoch {
  DateTime time;
  std::vector<ObservationRecord> observations;
};

struct RinexObservationFile {
  std::map<char, std::vector<std::string>> observation_types_by_system;
  std::array<double, 3> approximate_position_xyz{};
  std::vector<ObservationEpoch> epochs;
};

struct BroadcastEphemeris {
  char system{'G'};
  std::string prn;
  DateTime toc{};
  double af0{};
  double af1{};
  double af2{};
  double iode{};
  double crs{};
  double delta_n{};
  double m0{};
  double cuc{};
  double e{};
  double cus{};
  double sqrt_a{};
  double toe{};
  double cic{};
  double omega0{};
  double cis{};
  double i0{};
  double crc{};
  double omega{};
  double omega_dot{};
  double idot{};
  double gps_week{};
  double tgd{};
  double bgd_e5a_e1{0.0};
  double bgd_e5b_e1{0.0};
};

struct NavDataset {
  std::vector<BroadcastEphemeris> ephemerides;
  std::optional<std::array<double, 4>> gps_iono_alpha;
  std::optional<std::array<double, 4>> gps_iono_beta;
};

struct Vec3 {
  double x{};
  double y{};
  double z{};
};

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

std::array<double, 3> ecef_to_geodetic(const Vec3& xyz);

double deg_to_rad(double value) { return value * kPi / 180.0; }
double rad_to_deg(double value) { return value * 180.0 / kPi; }

bool file_is_gzip(const std::string& path) {
  std::ifstream input(path, std::ios::binary);
  if (!input.good()) {
    return false;
  }
  unsigned char bytes[2]{};
  input.read(reinterpret_cast<char*>(bytes), 2);
  return input.gcount() == 2 && bytes[0] == 0x1f && bytes[1] == 0x8b;
}

std::vector<std::string> read_plain_lines(const std::string& path) {
  std::ifstream input(path);
  if (!input.good()) {
    throw std::runtime_error("Unable to open file: " + path);
  }
  std::vector<std::string> lines;
  std::string line;
  while (std::getline(input, line)) {
    if (!line.empty() && line.back() == '\r') {
      line.pop_back();
    }
    lines.push_back(line);
  }
  return lines;
}

std::vector<std::string> read_lines(const std::string& path) {
  if (file_is_gzip(path)) {
    throw std::runtime_error("Gzip-compressed files are not yet supported in solver core. Download with decompress=true.");
  }
  return read_plain_lines(path);
}

std::string trim(const std::string& value) {
  const auto start = value.find_first_not_of(" \t");
  if (start == std::string::npos) {
    return "";
  }
  const auto end = value.find_last_not_of(" \t");
  return value.substr(start, end - start + 1);
}

double parse_double(const std::string& text) {
  std::string cleaned = trim(text);
  if (cleaned.empty()) {
    return std::numeric_limits<double>::quiet_NaN();
  }
  std::replace(cleaned.begin(), cleaned.end(), 'D', 'E');
  std::replace(cleaned.begin(), cleaned.end(), 'd', 'e');
  return std::stod(cleaned);
}

int parse_int(const std::string& text) {
  const std::string cleaned = trim(text);
  if (cleaned.empty()) {
    return 0;
  }
  return std::stoi(cleaned);
}

DateTime parse_rinex_epoch_prefix(const std::string& line, std::size_t offset = 0, bool short_year = false) {
  DateTime value;
  if (short_year) {
    int yy = parse_int(line.substr(offset + 0, 3));
    value.year = yy >= 80 ? 1900 + yy : 2000 + yy;
    value.month = parse_int(line.substr(offset + 3, 3));
    value.day = parse_int(line.substr(offset + 6, 3));
    value.hour = parse_int(line.substr(offset + 9, 3));
    value.minute = parse_int(line.substr(offset + 12, 3));
    value.second = parse_double(line.substr(offset + 15, 5));
  } else {
    value.year = parse_int(line.substr(offset + 0, 6));
    value.month = parse_int(line.substr(offset + 6, 3));
    value.day = parse_int(line.substr(offset + 9, 3));
    value.hour = parse_int(line.substr(offset + 12, 3));
    value.minute = parse_int(line.substr(offset + 15, 3));
    value.second = parse_double(line.substr(offset + 18, 5));
  }
  return value;
}

long long days_from_civil(int year, unsigned month, unsigned day) {
  year -= month <= 2;
  const int era = (year >= 0 ? year : year - 399) / 400;
  const unsigned yoe = static_cast<unsigned>(year - era * 400);
  const unsigned doy = (153 * (month + (month > 2 ? -3 : 9)) + 2) / 5 + day - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + static_cast<int>(doe) - 719468;
}

double unix_seconds(const DateTime& time) {
  const long long days = days_from_civil(time.year, static_cast<unsigned>(time.month), static_cast<unsigned>(time.day));
  return static_cast<double>(days) * 86400.0 + time.hour * 3600.0 + time.minute * 60.0 + time.second;
}

std::string to_iso8601(const DateTime& time) {
  std::ostringstream output;
  output << std::setfill('0') << std::setw(4) << time.year << '-' << std::setw(2) << time.month << '-'
         << std::setw(2) << time.day << 'T' << std::setw(2) << time.hour << ':' << std::setw(2) << time.minute
         << ':' << std::fixed << std::setprecision(3) << std::setw(6) << time.second << 'Z';
  return output.str();
}

GpsTime to_gps_time(const DateTime& time) {
  const DateTime gps_epoch{1980, 1, 6, 0, 0, 0.0};
  const double seconds = unix_seconds(time) - unix_seconds(gps_epoch);
  const int week = static_cast<int>(std::floor(seconds / 604800.0));
  const double tow = seconds - static_cast<double>(week) * 604800.0;
  return {week, tow};
}

double gps_time_difference(double value) {
  double adjusted = value;
  while (adjusted > 302400.0) {
    adjusted -= 604800.0;
  }
  while (adjusted < -302400.0) {
    adjusted += 604800.0;
  }
  return adjusted;
}

Vec3 rotate_earth(const Vec3& position, double travel_time) {
  const double angle = kOmegaEarth * travel_time;
  const double cos_a = std::cos(angle);
  const double sin_a = std::sin(angle);
  return {
      cos_a * position.x + sin_a * position.y,
      -sin_a * position.x + cos_a * position.y,
      position.z,
  };
}

double vector_norm(const Vec3& value) {
  return std::sqrt(value.x * value.x + value.y * value.y + value.z * value.z);
}

Vec3 operator-(const Vec3& lhs, const Vec3& rhs) {
  return {lhs.x - rhs.x, lhs.y - rhs.y, lhs.z - rhs.z};
}

Vec3 operator+(const Vec3& lhs, const Vec3& rhs) {
  return {lhs.x + rhs.x, lhs.y + rhs.y, lhs.z + rhs.z};
}

Vec3 operator*(double factor, const Vec3& rhs) {
  return {factor * rhs.x, factor * rhs.y, factor * rhs.z};
}

double distance_between(const Vec3& lhs, const Vec3& rhs) {
  return vector_norm(lhs - rhs);
}

Vec3 geodetic_to_ecef(double latitude_deg, double longitude_deg, double height_m) {
  constexpr double a = 6378137.0;
  constexpr double f = 1.0 / 298.257223563;
  const double e2 = f * (2.0 - f);
  const double lat = deg_to_rad(latitude_deg);
  const double lon = deg_to_rad(longitude_deg);
  const double sin_lat = std::sin(lat);
  const double cos_lat = std::cos(lat);
  const double sin_lon = std::sin(lon);
  const double cos_lon = std::cos(lon);
  const double n = a / std::sqrt(1.0 - e2 * sin_lat * sin_lat);
  return {
      (n + height_m) * cos_lat * cos_lon,
      (n + height_m) * cos_lat * sin_lon,
      (n * (1.0 - e2) + height_m) * sin_lat,
  };
}

bool finite_vec3(const Vec3& value) {
  return std::isfinite(value.x) && std::isfinite(value.y) && std::isfinite(value.z) && vector_norm(value) > 1000.0;
}

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

std::array<double, 3> ecef_to_geodetic(const Vec3& xyz) {
  constexpr double a = 6378137.0;
  constexpr double f = 1.0 / 298.257223563;
  const double b = a * (1.0 - f);
  const double e2 = 1.0 - (b * b) / (a * a);
  const double ep2 = (a * a - b * b) / (b * b);
  const double p = std::sqrt(xyz.x * xyz.x + xyz.y * xyz.y);
  const double theta = std::atan2(xyz.z * a, p * b);
  const double st = std::sin(theta);
  const double ct = std::cos(theta);
  const double lon = std::atan2(xyz.y, xyz.x);
  const double lat = std::atan2(xyz.z + ep2 * b * st * st * st, p - e2 * a * ct * ct * ct);
  const double sin_lat = std::sin(lat);
  const double n = a / std::sqrt(1.0 - e2 * sin_lat * sin_lat);
  const double h = p / std::cos(lat) - n;
  return {rad_to_deg(lat), rad_to_deg(lon), h};
}

std::pair<double, double> elevation_azimuth(const Vec3& receiver, const Vec3& satellite) {
  const auto blh = ecef_to_geodetic(receiver);
  const double lat = deg_to_rad(blh[0]);
  const double lon = deg_to_rad(blh[1]);
  const Vec3 diff = satellite - receiver;
  const double sin_lat = std::sin(lat);
  const double cos_lat = std::cos(lat);
  const double sin_lon = std::sin(lon);
  const double cos_lon = std::cos(lon);

  const double east = -sin_lon * diff.x + cos_lon * diff.y;
  const double north = -sin_lat * cos_lon * diff.x - sin_lat * sin_lon * diff.y + cos_lat * diff.z;
  const double up = cos_lat * cos_lon * diff.x + cos_lat * sin_lon * diff.y + sin_lat * diff.z;
  const double horizontal = std::sqrt(east * east + north * north);
  double azimuth = rad_to_deg(std::atan2(east, north));
  if (azimuth < 0.0) {
    azimuth += 360.0;
  }
  return {rad_to_deg(std::atan2(up, horizontal)), azimuth};
}

RinexObservationFile parse_rinex_observation(const std::string& path) {
  const auto lines = read_lines(path);
  RinexObservationFile file;

  std::size_t index = 0;
  for (; index < lines.size(); ++index) {
    const std::string& line = lines[index];
    const std::string label = line.size() >= 60 ? trim(line.substr(60)) : "";
    if (label == "SYS / # / OBS TYPES" && !line.empty()) {
      const char system = line[0];
      int count = parse_int(line.substr(3, 3));
      auto& system_types = file.observation_types_by_system[system];
      for (int column = 0; column < std::min(13, count); ++column) {
        system_types.push_back(trim(line.substr(7 + column * 4, 3)));
      }
      while (static_cast<int>(system_types.size()) < count) {
        ++index;
        const std::string& continuation = lines[index];
        int remaining = count - static_cast<int>(system_types.size());
        for (int column = 0; column < std::min(13, remaining); ++column) {
          system_types.push_back(trim(continuation.substr(7 + column * 4, 3)));
        }
      }
    } else if (label == "APPROX POSITION XYZ") {
      file.approximate_position_xyz = {
          parse_double(line.substr(0, 14)),
          parse_double(line.substr(14, 14)),
          parse_double(line.substr(28, 14)),
      };
    } else if (label == "END OF HEADER") {
      ++index;
      break;
    }
  }

  while (index < lines.size()) {
    const std::string& line = lines[index];
    if (line.empty() || line[0] != '>') {
      ++index;
      continue;
    }

    ObservationEpoch epoch;
    epoch.time = parse_rinex_epoch_prefix(line, 2, false);
    const int flag = parse_int(line.substr(31, 1));
    const int satellite_count = parse_int(line.substr(32, 3));
    ++index;
    if (flag != 0 && flag != 1) {
      index += satellite_count;
      continue;
    }

    for (int satellite_index = 0; satellite_index < satellite_count && index < lines.size(); ++satellite_index) {
      std::string record = lines[index];
      if (record.size() < 3) {
        ++index;
        continue;
      }
      const std::string prn = record.substr(0, 3);
      const char system = prn[0];
      const auto types_iterator = file.observation_types_by_system.find(system);
      if (types_iterator == file.observation_types_by_system.end()) {
        ++index;
        continue;
      }
      const auto& observation_types = types_iterator->second;
      const int observation_count = static_cast<int>(observation_types.size());
      const int required_lines = static_cast<int>(std::ceil((3.0 + observation_count * 16.0) / 80.0));
      for (int extra = 1; extra < required_lines && index + extra < lines.size(); ++extra) {
        std::string padded = lines[index + extra];
        if (padded.size() < 80) {
          padded.resize(80, ' ');
        }
        record += padded;
      }
      index += required_lines;

      ObservationRecord observation;
      observation.satellite = prn;
      for (int obs_index = 0; obs_index < observation_count; ++obs_index) {
        const std::size_t start = 3 + static_cast<std::size_t>(obs_index) * 16;
        if (start + 14 > record.size()) {
          continue;
        }
        const std::string value_text = trim(record.substr(start, 14));
        if (value_text.empty()) {
          continue;
        }
        observation.values[observation_types[obs_index]] = std::stod(value_text);
      }
      epoch.observations.push_back(std::move(observation));
    }
    file.epochs.push_back(std::move(epoch));
  }

  if (file.epochs.empty()) {
    throw std::runtime_error("No observation epochs found in " + path);
  }
  return file;
}

NavDataset parse_rinex_navigation(const std::string& path) {
  const auto lines = read_lines(path);
  NavDataset dataset;
  std::size_t index = 0;
  for (; index < lines.size(); ++index) {
    const std::string& line = lines[index];
    const std::string label = line.size() >= 60 ? trim(line.substr(60)) : "";
    if (label == "IONOSPHERIC CORR") {
      const std::string system = trim(line.substr(0, 4));
      std::array<double, 4> values{};
      for (int field = 0; field < 4; ++field) {
        values[field] = parse_double(line.substr(5 + field * 12, 12));
      }
      if (system == "GPSA") {
        dataset.gps_iono_alpha = values;
      } else if (system == "GPSB") {
        dataset.gps_iono_beta = values;
      }
    } else if (label == "END OF HEADER") {
      ++index;
      break;
    }
  }

  auto parse_nav_field = [](const std::string& line, int field_index) {
    const std::size_t start = 4 + static_cast<std::size_t>(field_index) * 19;
    if (start >= line.size()) {
      return std::numeric_limits<double>::quiet_NaN();
    }
    return parse_double(line.substr(start, 19));
  };

  while (index + 7 < lines.size()) {
    const std::string& line0 = lines[index];
    if (line0.empty()) {
      ++index;
      continue;
    }
    if (line0[0] != 'G' && line0[0] != 'E') {
      index += 8;
      continue;
    }
    BroadcastEphemeris eph;
    eph.system = line0[0];
    eph.prn = trim(line0.substr(0, 3));
    eph.toc = parse_rinex_epoch_prefix(line0, 3, false);
    eph.af0 = parse_double(line0.substr(23, 19));
    eph.af1 = parse_double(line0.substr(42, 19));
    eph.af2 = parse_double(line0.substr(61, 19));

    const std::string& line1 = lines[index + 1];
    const std::string& line2 = lines[index + 2];
    const std::string& line3 = lines[index + 3];
    const std::string& line4 = lines[index + 4];
    const std::string& line5 = lines[index + 5];
    const std::string& line6 = lines[index + 6];

    eph.iode = parse_nav_field(line1, 0);
    eph.crs = parse_nav_field(line1, 1);
    eph.delta_n = parse_nav_field(line1, 2);
    eph.m0 = parse_nav_field(line1, 3);
    eph.cuc = parse_nav_field(line2, 0);
    eph.e = parse_nav_field(line2, 1);
    eph.cus = parse_nav_field(line2, 2);
    eph.sqrt_a = parse_nav_field(line2, 3);
    eph.toe = parse_nav_field(line3, 0);
    eph.cic = parse_nav_field(line3, 1);
    eph.omega0 = parse_nav_field(line3, 2);
    eph.cis = parse_nav_field(line3, 3);
    eph.i0 = parse_nav_field(line4, 0);
    eph.crc = parse_nav_field(line4, 1);
    eph.omega = parse_nav_field(line4, 2);
    eph.omega_dot = parse_nav_field(line4, 3);
    eph.idot = parse_nav_field(line5, 0);
    eph.gps_week = parse_nav_field(line5, 2);
    if (eph.system == 'G') {
      eph.tgd = parse_nav_field(line6, 2);
    } else if (eph.system == 'E') {
      eph.bgd_e5a_e1 = parse_nav_field(line6, 2);
      eph.bgd_e5b_e1 = parse_nav_field(line6, 3);
    }

    dataset.ephemerides.push_back(eph);
    index += 8;
  }

  if (dataset.ephemerides.empty()) {
    throw std::runtime_error("No GPS ephemeris records found in " + path);
  }
  return dataset;
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
  DateTime request_time{};
  std::sscanf(requested_time->c_str(), "%d-%d-%dT%d:%d:%lf", &request_time.year, &request_time.month, &request_time.day,
              &request_time.hour, &request_time.minute, &request_time.second);
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

  DateTime request_time{};
  std::sscanf(requested_time->c_str(), "%d-%d-%dT%d:%d:%lf", &request_time.year, &request_time.month, &request_time.day,
              &request_time.hour, &request_time.minute, &request_time.second);
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
      DateTime request_time{};
      std::sscanf(requested_epoch->c_str(), "%d-%d-%dT%d:%d:%lf", &request_time.year, &request_time.month, &request_time.day,
                  &request_time.hour, &request_time.minute, &request_time.second);
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
