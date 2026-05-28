#include "time_system.hpp"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <iomanip>
#include <sstream>
#include <stdexcept>

namespace gnss {

namespace {

long long days_from_civil(int year, unsigned month, unsigned day) {
  year -= month <= 2;
  const int era = (year >= 0 ? year : year - 399) / 400;
  const unsigned yoe = static_cast<unsigned>(year - era * 400);
  const unsigned doy = (153 * (month + (month > 2 ? -3 : 9)) + 2) / 5 + day - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + static_cast<int>(doe) - 719468;
}

DateTime from_unix_seconds(double seconds, TimeSystem system) {
  const auto whole_days = static_cast<long long>(std::floor(seconds / 86400.0));
  double second_of_day = seconds - static_cast<double>(whole_days) * 86400.0;
  long long z = whole_days + 719468;
  if (second_of_day < 0.0) {
    second_of_day += 86400.0;
    --z;
  }

  const long long era = (z >= 0 ? z : z - 146096) / 146097;
  const auto doe = static_cast<unsigned>(z - era * 146097);
  const unsigned yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  long long year = static_cast<long long>(yoe) + era * 400;
  const unsigned doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  const unsigned mp = (5 * doy + 2) / 153;
  const unsigned day = doy - (153 * mp + 2) / 5 + 1;
  const unsigned month = mp + (mp < 10 ? 3 : -9);
  year += month <= 2;

  const int hour = static_cast<int>(second_of_day / 3600.0);
  second_of_day -= hour * 3600.0;
  const int minute = static_cast<int>(second_of_day / 60.0);
  const double second = second_of_day - minute * 60.0;
  return {static_cast<int>(year), static_cast<int>(month), static_cast<int>(day), hour, minute, second, system};
}

double offset_to_gpst_seconds(TimeSystem system) {
  switch (system) {
    case TimeSystem::GPST:
    case TimeSystem::GST:
      return 0.0;
    case TimeSystem::UTC:
      return 18.0;
    case TimeSystem::BDT:
      return 14.0;
    case TimeSystem::GLOT:
      return 18.0 - 10800.0;
  }
  return 0.0;
}

int parse_int(const std::string& text) {
  const auto start = text.find_first_not_of(" \t");
  if (start == std::string::npos) {
    return 0;
  }
  return std::stoi(text.substr(start));
}

double parse_double(const std::string& text) {
  auto cleaned = text;
  std::replace(cleaned.begin(), cleaned.end(), 'D', 'E');
  std::replace(cleaned.begin(), cleaned.end(), 'd', 'e');
  const auto start = cleaned.find_first_not_of(" \t");
  if (start == std::string::npos) {
    return 0.0;
  }
  return std::stod(cleaned.substr(start));
}

}  // namespace

std::string time_system_name(TimeSystem system) {
  switch (system) {
    case TimeSystem::UTC:
      return "UTC";
    case TimeSystem::GPST:
      return "GPST";
    case TimeSystem::GST:
      return "GST";
    case TimeSystem::BDT:
      return "BDT";
    case TimeSystem::GLOT:
      return "GLOT";
  }
  return "UTC";
}

TimeSystem parse_time_system(const std::string& value) {
  if (value == "GPST" || value == "GPS") {
    return TimeSystem::GPST;
  }
  if (value == "GST" || value == "GAL") {
    return TimeSystem::GST;
  }
  if (value == "BDT" || value == "BDS") {
    return TimeSystem::BDT;
  }
  if (value == "GLOT" || value == "GLO") {
    return TimeSystem::GLOT;
  }
  return TimeSystem::UTC;
}

DateTime parse_iso8601_datetime(const std::string& text, TimeSystem system) {
  DateTime value{};
  value.system = system;
  if (std::sscanf(text.c_str(), "%d-%d-%dT%d:%d:%lf", &value.year, &value.month, &value.day, &value.hour,
                  &value.minute, &value.second) != 6) {
    throw std::runtime_error("Invalid ISO-8601 datetime: " + text);
  }
  return value;
}

DateTime parse_rinex_epoch_prefix(const std::string& line, std::size_t offset, bool short_year, TimeSystem system) {
  DateTime value{};
  value.system = system;
  if (short_year) {
    const int yy = parse_int(line.substr(offset + 0, 3));
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

DateTime convert_time_system(const DateTime& time, TimeSystem target_system) {
  if (time.system == target_system) {
    return time;
  }
  const double gpst_seconds = unix_seconds(time) + offset_to_gpst_seconds(time.system);
  return from_unix_seconds(gpst_seconds - offset_to_gpst_seconds(target_system), target_system);
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
  const DateTime gps_epoch{1980, 1, 6, 0, 0, 0.0, TimeSystem::GPST};
  const DateTime gpst_time = convert_time_system(time, TimeSystem::GPST);
  const double seconds = unix_seconds(gpst_time) - unix_seconds(gps_epoch);
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

}  // namespace gnss
