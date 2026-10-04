// WiFi.h for the Courier simulator (Stop 6): the part of the ESP32's Wi-Fi API that Courier uses —
// join a network, get an IP address, serve TCP connections — on the simulator's own network (net.js).
//
//   WiFi.begin("courier-office");                 // joining takes about 1.5 s of robot time
//   if (WiFi.status() == WL_CONNECTED) Serial.println(WiFi.localIP());
//   WiFiServer server(7000);  server.begin();     // listen on a port
//   WiFiClient client = server.accept();          // the next visitor (check client.connected())
//   while (client.available()) { int c = client.read(); … }
//   client.print("{\"ok\":true}\n");
//
// As in arduino-esp32 3.3: server.accept() (server.available() is the older name for it), and a
// WiFiClient is a Stream, so client.print/println/write and ArduinoJson's serializeJson(doc, client)
// work. Not here: the robot connecting out (WiFiClient::connect), UDP, scanning, access-point mode.
#ifndef COURIER_SIM_WIFI_H
#define COURIER_SIM_WIFI_H

#include <Arduino.h>

extern "C" {
COURIER_IMPORT(wifi_begin) int __courier_wifi_begin(const char *ssid, int ssidLen, const char *pass, int passLen);
COURIER_IMPORT(wifi_status) int __courier_wifi_status(void);
COURIER_IMPORT(wifi_ip) uint32_t __courier_wifi_ip(void);
COURIER_IMPORT(wifi_disconnect) void __courier_wifi_disconnect(void);
COURIER_IMPORT(tcp_listen) int __courier_tcp_listen(int port);
COURIER_IMPORT(tcp_accept) int __courier_tcp_accept(int port);
COURIER_IMPORT(tcp_connected) int __courier_tcp_connected(int sock);
COURIER_IMPORT(tcp_available) int __courier_tcp_available(int sock);
COURIER_IMPORT(tcp_read) int __courier_tcp_read(int sock, uint8_t *buf, int max);
COURIER_IMPORT(tcp_peek) int __courier_tcp_peek(int sock);
COURIER_IMPORT(tcp_write) int __courier_tcp_write(int sock, const uint8_t *buf, int len);
COURIER_IMPORT(tcp_close) void __courier_tcp_close(int sock);
}

typedef enum {
  WL_NO_SHIELD = 255,
  WL_IDLE_STATUS = 0,
  WL_NO_SSID_AVAIL = 1,
  WL_SCAN_COMPLETED = 2,
  WL_CONNECTED = 3,
  WL_CONNECT_FAILED = 4,
  WL_CONNECTION_LOST = 5,
  WL_DISCONNECTED = 6,
} wl_status_t;

typedef enum { WIFI_OFF = 0, WIFI_STA = 1, WIFI_AP = 2, WIFI_AP_STA = 3 } wifi_mode_t;

// An IPv4 address. Serial.println(WiFi.localIP()) prints it as 192.168.4.23; ip[0] is the first part.
class IPAddress : public Printable {
 public:
  IPAddress() : v_(0) {}
  IPAddress(uint8_t a, uint8_t b, uint8_t c, uint8_t d) : v_((uint32_t)a | (uint32_t)b << 8 | (uint32_t)c << 16 | (uint32_t)d << 24) {}
  explicit IPAddress(uint32_t v) : v_(v) {}
  uint8_t operator[](int i) const { return (uint8_t)(v_ >> (8 * (i & 3))); }
  bool operator==(const IPAddress &o) const { return v_ == o.v_; }
  bool operator!=(const IPAddress &o) const { return v_ != o.v_; }
  explicit operator uint32_t() const { return v_; }
  size_t printTo(Print &p) const override {
    size_t n = 0;
    for (int i = 0; i < 4; i++) { if (i) n += p.print('.'); n += p.print((unsigned)(*this)[i]); }
    return n;
  }
  // (On the chip, toString() returns a String; the simulator has no String class. Print the address,
  // or snprintf its four parts: snprintf(buf, sizeof buf, "%u.%u.%u.%u", ip[0], ip[1], ip[2], ip[3]).)

 private:
  uint32_t v_;
};

// One TCP connection (to a visitor that connected to your WiFiServer). Read what arrived with
// available()/read(); write with print/println/write. connected() stays true while unread bytes
// remain, even after the other side has hung up; stop() hangs up.
class WiFiClient : public Stream {
 public:
  WiFiClient() : s_(-1) {}
  explicit WiFiClient(int sock) : s_(sock) {}
  uint8_t connected() { return s_ >= 0 && __courier_tcp_connected(s_) ? 1 : 0; }
  operator bool() { return connected(); }
  int available() override { return s_ >= 0 ? __courier_tcp_available(s_) : 0; }
  int read() override {
    uint8_t c;
    return s_ >= 0 && __courier_tcp_read(s_, &c, 1) == 1 ? c : -1;
  }
  int read(uint8_t *buf, size_t size) { return s_ >= 0 ? __courier_tcp_read(s_, buf, (int)size) : -1; }
  int peek() override { return s_ >= 0 ? __courier_tcp_peek(s_) : -1; }
  using Print::write;
  size_t write(uint8_t c) override { return write(&c, 1); }
  size_t write(const uint8_t *buf, size_t size) override {
    if (s_ < 0) return 0;
    int n = __courier_tcp_write(s_, buf, (int)size);
    return n > 0 ? (size_t)n : 0;
  }
  void flush() override {}
  void stop() {
    if (s_ >= 0) __courier_tcp_close(s_);
    s_ = -1;
  }
  bool operator==(const WiFiClient &o) const { return s_ == o.s_; }

 private:
  int s_;
};

// Listens on a port. begin() once (any time: visitors get through once the robot is on the Wi-Fi),
// then accept() in loop() for the next visitor (a client that isn't connected() if nobody's waiting).
class WiFiServer {
 public:
  explicit WiFiServer(uint16_t port = 80, uint8_t maxClients = 4) : port_(port), on_(false) { (void)maxClients; }
  void begin(uint16_t port = 0) {
    if (port) port_ = port;
    on_ = __courier_tcp_listen(port_) == 0;
  }
  WiFiClient accept() { return on_ ? WiFiClient(__courier_tcp_accept(port_)) : WiFiClient(); }
  WiFiClient available() { return accept(); }  // the older name (arduino-esp32 3.x prefers accept())
  operator bool() { return on_; }

 private:
  uint16_t port_;
  bool on_;
};

class CourierWiFi {
 public:
  wl_status_t begin(const char *ssid, const char *password = nullptr) {
    __courier_wifi_begin(ssid, (int)strlen(ssid), password, password ? (int)strlen(password) : 0);
    return status();
  }
  wl_status_t status() { return (wl_status_t)__courier_wifi_status(); }
  bool isConnected() { return status() == WL_CONNECTED; }
  IPAddress localIP() { return IPAddress(__courier_wifi_ip()); }
  bool disconnect(bool wifiOff = false) { (void)wifiOff; __courier_wifi_disconnect(); return true; }
  bool mode(wifi_mode_t m) { return m == WIFI_STA || m == WIFI_OFF; }  // the robot joins networks (station)
  bool setHostname(const char *name) { (void)name; return true; }
  bool setAutoReconnect(bool on) { (void)on; return true; }
};
static CourierWiFi WiFi;

#endif
