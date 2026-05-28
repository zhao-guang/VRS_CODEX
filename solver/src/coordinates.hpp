#pragma once

#include <array>
#include <utility>

namespace gnss {

enum class CoordinateFrame {
  ECEF,
  Geodetic,
  ENU,
};

struct Vec3 {
  double x{};
  double y{};
  double z{};
  CoordinateFrame frame{CoordinateFrame::ECEF};

  Vec3 operator-(const Vec3& rhs) const;
  Vec3 operator+(const Vec3& rhs) const;
  Vec3 operator*(double factor) const;
  Vec3& operator+=(const Vec3& rhs);
  Vec3& operator-=(const Vec3& rhs);
  Vec3& operator*=(double factor);
};

struct GeodeticPosition {
  double latitude_deg{};
  double longitude_deg{};
  double height_m{};
};

double deg_to_rad(double value);
double rad_to_deg(double value);
double vector_norm(const Vec3& value);
double distance_between(const Vec3& lhs, const Vec3& rhs);
bool finite_vec3(const Vec3& value);
Vec3 operator*(double factor, const Vec3& rhs);
Vec3 rotate_earth(const Vec3& position, double travel_time);
Vec3 geodetic_to_ecef(double latitude_deg, double longitude_deg, double height_m);
std::array<double, 3> ecef_to_geodetic(const Vec3& xyz);
std::pair<double, double> elevation_azimuth(const Vec3& receiver, const Vec3& satellite);

}  // namespace gnss
