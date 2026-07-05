cmake_minimum_required(VERSION 3.10)
project(jsapi_langningchen C CXX)
set(LIB_NAME jsapi_langningchen)
set(MID_LIB_NAME iot_sdk_lib)

if(NOT DEFINED ENV{CROSS_TOOLCHAIN_PREFIX})
    message(FATAL_ERROR "CROSS_TOOLCHAIN_PREFIX environment variable is not set.")
endif()
set(CMAKE_C_COMPILER "$ENV{CROSS_TOOLCHAIN_PREFIX}gcc")
set(CMAKE_CXX_COMPILER "$ENV{CROSS_TOOLCHAIN_PREFIX}g++")

set(IOT_UI_SDK_PATH "${CMAKE_SOURCE_DIR}/iot-miniapp-sdk")
set(CMAKE_FIND_ROOT_PATH "${CMAKE_SOURCE_DIR}/lib")
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)

include_directories(
    ${CMAKE_SOURCE_DIR}/src/
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/lib/nlohmann/include
)
find_library(CURL_LIBRARY curl PATHS ${CMAKE_SOURCE_DIR}/lib REQUIRED)
find_library(SQLITE_LIBRARY sqlite3 PATHS ${CMAKE_SOURCE_DIR}/lib REQUIRED)
link_directories(${IOT_UI_SDK_PATH}/lib)
message("CURL_LIBRARY: ${CURL_LIBRARY}")
message("SQLITE_LIBRARY: ${SQLITE_LIBRARY}")

set(CMAKE_CXX_STANDARD 17)

add_compile_options(-Wall -Werror=return-type -Wno-psabi)
if(CMAKE_BUILD_TYPE STREQUAL "Release")
    add_compile_options(-Os)
else()
    add_compile_options(-g -O0)
    add_compile_options(-Wformat -Wformat-security -fstack-protector --param ssp-buffer-size=4)
endif()

file(GLOB_RECURSE LIB_SOURCES iot-miniapp-sdk/src/*.cpp)
add_library(${MID_LIB_NAME} STATIC ${LIB_SOURCES})
target_compile_options(${MID_LIB_NAME} PRIVATE -w)
target_include_directories(${MID_LIB_NAME} PUBLIC ${IOT_UI_SDK_PATH}/include)
set_target_properties(${MID_LIB_NAME} PROPERTIES POSITION_INDEPENDENT_CODE ON)

set(RAWDICT_TXT ${CMAKE_SOURCE_DIR}/rawdict_utf16_65105_freq.txt)
set(RAWDICT_TXT_UTF8 ${CMAKE_BINARY_DIR}/rawdict_utf8.txt)
set(RAWDICT_HPP ${CMAKE_SOURCE_DIR}/src/IME/rawdict_data.hpp)
add_custom_command(
    OUTPUT ${RAWDICT_HPP}
    COMMAND iconv -f UTF-16 -t UTF-8 ${RAWDICT_TXT} -o ${RAWDICT_TXT_UTF8}
    COMMAND ${CMAKE_COMMAND} -E echo "// Auto-generated from rawdict_utf16_65105_freq.txt" > ${RAWDICT_HPP}
    COMMAND ${CMAKE_COMMAND} -E echo "#pragma once" >> ${RAWDICT_HPP}
    COMMAND ${CMAKE_COMMAND} -E echo "#include <string>" >> ${RAWDICT_HPP}
    COMMAND ${CMAKE_COMMAND} -E echo "static const std::string RAWDICT_DATA = R\"DICT(" >> ${RAWDICT_HPP}
    COMMAND ${CMAKE_COMMAND} -E cat ${RAWDICT_TXT_UTF8} >> ${RAWDICT_HPP}
    COMMAND ${CMAKE_COMMAND} -E echo ")DICT\";" >> ${RAWDICT_HPP}
    VERBATIM
)
add_custom_target(generate_rawdict_data_hpp DEPENDS ${RAWDICT_HPP})

file(GLOB_RECURSE SOURCES src/*.cpp src/IME/*.cpp src/Database/*.cpp)
add_library(${LIB_NAME} SHARED ${SOURCES})
add_dependencies(${LIB_NAME} generate_rawdict_data_hpp)
target_link_libraries(${LIB_NAME} PRIVATE
    ${MID_LIB_NAME}
    ${CURL_LIBRARY}
    ${SQLITE_LIBRARY}
    -Wl,-unresolved-symbols=ignore-all)
