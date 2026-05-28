#pragma once

#include "time_system.hpp"

#include <array>
#include <map>
#include <optional>
#include <string>
#include <vector>

namespace gnss {

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

std::string trim(const std::string& value);
double parse_rinex_double(const std::string& text);
int parse_rinex_int(const std::string& text);
std::vector<std::string> read_rinex_lines(const std::string& path);
RinexObservationFile parse_rinex_observation(const std::string& path);
NavDataset parse_rinex_navigation(const std::string& path);

}  // namespace gnss
