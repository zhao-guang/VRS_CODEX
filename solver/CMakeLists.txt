cmake_minimum_required(VERSION 3.20)
project(gnss_solver_service VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(FetchContent)

FetchContent_Declare(
  cpp_httplib
  GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
  GIT_TAG v0.18.7
)

FetchContent_Declare(
  nlohmann_json
  GIT_REPOSITORY https://github.com/nlohmann/json.git
  GIT_TAG v3.11.3
)

FetchContent_MakeAvailable(cpp_httplib)
FetchContent_MakeAvailable(nlohmann_json)

add_executable(gnss_solver_service
  src/coordinates.cpp
  src/main.cpp
  src/rinex_reader.cpp
  src/spp_solver.cpp
  src/time_system.cpp
)

target_link_libraries(gnss_solver_service PRIVATE httplib::httplib nlohmann_json::nlohmann_json)

if(MSVC)
  target_compile_options(gnss_solver_service PRIVATE /W4)
else()
  target_compile_options(gnss_solver_service PRIVATE -Wall -Wextra -Wpedantic)
endif()
