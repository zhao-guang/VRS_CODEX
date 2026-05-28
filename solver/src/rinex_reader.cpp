#include "rinex_reader.hpp"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <limits>
#include <stdexcept>

namespace gnss {

namespace {

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

TimeSystem navigation_time_system(char system) {
  switch (system) {
    case 'G':
      return TimeSystem::GPST;
    case 'E':
      return TimeSystem::GST;
    case 'C':
      return TimeSystem::BDT;
    case 'R':
      return TimeSystem::GLOT;
    default:
      return TimeSystem::UTC;
  }
}

}  // namespace

std::string trim(const std::string& value) {
  const auto start = value.find_first_not_of(" \t");
  if (start == std::string::npos) {
    return "";
  }
  const auto end = value.find_last_not_of(" \t");
  return value.substr(start, end - start + 1);
}

double parse_rinex_double(const std::string& text) {
  std::string cleaned = trim(text);
  if (cleaned.empty()) {
    return std::numeric_limits<double>::quiet_NaN();
  }
  std::replace(cleaned.begin(), cleaned.end(), 'D', 'E');
  std::replace(cleaned.begin(), cleaned.end(), 'd', 'e');
  return std::stod(cleaned);
}

int parse_rinex_int(const std::string& text) {
  const std::string cleaned = trim(text);
  if (cleaned.empty()) {
    return 0;
  }
  return std::stoi(cleaned);
}

std::vector<std::string> read_rinex_lines(const std::string& path) {
  if (file_is_gzip(path)) {
    throw std::runtime_error("Gzip-compressed files are not yet supported in solver core. Download with decompress=true.");
  }
  return read_plain_lines(path);
}

RinexObservationFile parse_rinex_observation(const std::string& path) {
  const auto lines = read_rinex_lines(path);
  RinexObservationFile file;

  std::size_t index = 0;
  for (; index < lines.size(); ++index) {
    const std::string& line = lines[index];
    const std::string label = line.size() >= 60 ? trim(line.substr(60)) : "";
    if (label == "SYS / # / OBS TYPES" && !line.empty()) {
      const char system = line[0];
      int count = parse_rinex_int(line.substr(3, 3));
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
          parse_rinex_double(line.substr(0, 14)),
          parse_rinex_double(line.substr(14, 14)),
          parse_rinex_double(line.substr(28, 14)),
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
    epoch.time = parse_rinex_epoch_prefix(line, 2, false, TimeSystem::UTC);
    const int flag = parse_rinex_int(line.substr(31, 1));
    const int satellite_count = parse_rinex_int(line.substr(32, 3));
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
  const auto lines = read_rinex_lines(path);
  NavDataset dataset;
  std::size_t index = 0;
  for (; index < lines.size(); ++index) {
    const std::string& line = lines[index];
    const std::string label = line.size() >= 60 ? trim(line.substr(60)) : "";
    if (label == "IONOSPHERIC CORR") {
      const std::string system = trim(line.substr(0, 4));
      std::array<double, 4> values{};
      for (int field = 0; field < 4; ++field) {
        values[field] = parse_rinex_double(line.substr(5 + field * 12, 12));
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
    return parse_rinex_double(line.substr(start, 19));
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
    eph.toc = parse_rinex_epoch_prefix(line0, 3, false, navigation_time_system(eph.system));
    eph.af0 = parse_rinex_double(line0.substr(23, 19));
    eph.af1 = parse_rinex_double(line0.substr(42, 19));
    eph.af2 = parse_rinex_double(line0.substr(61, 19));

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

}  // namespace gnss
