#include <cstdlib>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>

#include <httplib.h>
#include <nlohmann/json.hpp>

#include "spp_solver.hpp"

namespace {

int resolve_port() {
  const char* raw_port = std::getenv("GNSS_SOLVER_PORT");
  if (raw_port == nullptr) {
    return 8090;
  }

  try {
    return std::stoi(raw_port);
  } catch (...) {
    return 8090;
  }
}

std::string json_response(const std::string& payload) {
  return payload;
}

}  // namespace

int main() {
  httplib::Server server;

  server.Get("/health", [](const httplib::Request&, httplib::Response& response) {
    response.set_content(
        json_response(R"({"status":"ok","service":"gnss-solver","version":"0.1.0"})"),
        "application/json");
  });

  server.Get("/solver/v1/health", [](const httplib::Request&, httplib::Response& response) {
    response.set_content(
        json_response(R"({"status":"ok","service":"gnss-solver","version":"0.1.0"})"),
        "application/json");
  });

  server.Get("/solver/v1/capabilities", [](const httplib::Request&, httplib::Response& response) {
    response.set_content(
        json_response(
            R"({"constellations":["GPS","BDS","GAL","GLO"],"modes":["spp","rtd","rtk"],"formats":["rinex2","rinex3","rinex4","crx","gz"]})"),
        "application/json");
  });

  server.Post("/solver/v1/solve/spp", [](const httplib::Request& request, httplib::Response& response) {
    try {
      const auto payload = nlohmann::json::parse(request.body);
      const auto result = solve_spp_request(payload);
      response.set_content(result.dump(), "application/json");
    } catch (const std::exception& exc) {
      nlohmann::json result = {
          {"jobId", "invalid-request"},
          {"status", "failed"},
          {"engine", "cpp-solver-gps-spp"},
          {"error", exc.what()},
          {"summary", {{"mode", "spp"}, {"solutionStatus", "failed"}}},
          {"quality", nlohmann::json::object()},
          {"epochs", nlohmann::json::array()},
          {"satellites", nlohmann::json::array()},
      };
      response.status = 400;
      response.set_content(result.dump(), "application/json");
    }
  });

  server.Post("/solver/v1/solve/differential",
              [](const httplib::Request&, httplib::Response& response) {
                response.set_content(
                    json_response(
                        R"({"jobId":"stub-diff-job","status":"accepted","message":"Differential solver stub is ready for implementation."})"),
                    "application/json");
              });

  const int port = resolve_port();
  std::cout << "GNSS solver service listening on http://0.0.0.0:" << port << std::endl;
  server.listen("0.0.0.0", port);
  return 0;
}
