#pragma once

#include <cstddef>
#include <string>

namespace gnss {

enum class TimeSystem {
  UTC,
  GPST,
  GST,
  BDT,
  GLOT,
};

struct DateTime {
  int year{};
  int month{};
  int day{};
  int hour{};
  int minute{};
  double second{};
  TimeSystem system{TimeSystem::UTC};
};

struct GpsTime {
  int week{};
  double tow{};
};

std::string time_system_name(TimeSystem system);
TimeSystem parse_time_system(const std::string& value);
DateTime parse_iso8601_datetime(const std::string& text, TimeSystem system = TimeSystem::UTC);
DateTime parse_rinex_epoch_prefix(const std::string& line, std::size_t offset = 0, bool short_year = false,
                                  TimeSystem system = TimeSystem::UTC);
DateTime convert_time_system(const DateTime& time, TimeSystem target_system);
double unix_seconds(const DateTime& time);
std::string to_iso8601(const DateTime& time);
GpsTime to_gps_time(const DateTime& time);
double gps_time_difference(double value);

}  // namespace gnss
