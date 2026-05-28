#include "coordinates.hpp"

#include <algorithm>
#include <cmath>

namespace gnss {

namespace {

constexpr double kPi = 3.141592653589793238462643383279502884;
constexpr double kOmegaEarth = 7.2921151467e-5;

}  // namespace

double deg_to_rad(double value) { return value * kPi / 180.0; }

double rad_to_deg(double value) { return value * 180.0 / kPi; }

Vec3 Vec3::operator-(const Vec3& rhs) const {
  return {x - rhs.x, y - rhs.y, z - rhs.z, frame};
}

Vec3 Vec3::operator+(const Vec3& rhs) const {
  return {x + rhs.x, y + rhs.y, z + rhs.z, frame};
}

Vec3 Vec3::operator*(double factor) const {
  return {factor * x, factor * y, factor * z, frame};
}

Vec3& Vec3::operator+=(const Vec3& rhs) {
  x += rhs.x;
  y += rhs.y;
  z += rhs.z;
  return *this;
}

Vec3& Vec3::operator-=(const Vec3& rhs) {
  x -= rhs.x;
  y -= rhs.y;
  z -= rhs.z;
  return *this;
}

Vec3& Vec3::operator*=(double factor) {
  x *= factor;
  y *= factor;
  z *= factor;
  return *this;
}

double vector_norm(const Vec3& value) {
  return std::sqrt(value.x * value.x + value.y * value.y + value.z * value.z);
}

double distance_between(const Vec3& lhs, const Vec3& rhs) { return vector_norm(lhs - rhs); }

bool finite_vec3(const Vec3& value) {
  return std::isfinite(value.x) && std::isfinite(value.y) && std::isfinite(value.z) && vector_norm(value) > 1000.0;
}

Vec3 operator*(double factor, const Vec3& rhs) {
  return rhs * factor;
}

Vec3 rotate_earth(const Vec3& position, double travel_time) {
  const double angle = kOmegaEarth * travel_time;
  const double cos_a = std::cos(angle);
  const double sin_a = std::sin(angle);
  return {
      cos_a * position.x + sin_a * position.y,
      -sin_a * position.x + cos_a * position.y,
      position.z,
      position.frame,
  };
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
      CoordinateFrame::ECEF,
  };
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

}  // namespace gnss
