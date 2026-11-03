# Baseline Load Testing Benchmark Report

**Target Environment:** http://localhost:5000  
**Execution Date:** 3/11/2026, 8:47:14 am  
**Test Profile:** Normal Expected Concurrency Baseline  

---

## 📊 Executive Overview

| Metric Parameter | Observed Value | Specification / SLA |
| :--- | :---: | :--- |
| **Virtual Users (VUs)** | **100 users** | 100 concurrent workers |
| **Continuous Duration** | **30.02s** | 1 minute continuous run |
| **Total Requests Dispatched** | **35,800 reqs** | Thousands of requests per minute |
| **Throughput (RPS)** | **1192.34 req/sec** | Stable continuous API handling |
| **Success / Pass Rate** | **100.00%** | ≥ 99.0% SLA target |
| **Successful Requests** | **35,800** | HTTP 2xx / 3xx responses |
| **Failed Requests** | **0** | HTTP 4xx / 5xx / timeouts |

---

## ⏱️ Response Time Breakdown

```
Average : 58.02ms
Min     : 41ms
Max     : 136ms
Median  : 55ms
P95     : 78ms
P99     : 109ms
```

- **Fastest Response (Min):** `41ms`
- **Average Response Time:** `58.02ms`
- **Slowest Response (Max):** `136ms`
- **95% of Users Received Responses in:** `≤ 78ms`

---

## 🎯 Per-Endpoint Performance

| Endpoint | Path | Total Requests | RPS | Avg Latency | Min | Max |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Health Check** | `/api/health` | 7,160 | 238.47 req/sec | 58.02ms | 41ms | 136ms |
| **Venues Discovery** | `/api/venues` | 7,160 | 238.47 req/sec | 58.01ms | 41ms | 136ms |
| **Community Feed Posts** | `/api/posts` | 7,160 | 238.47 req/sec | 58.01ms | 41ms | 136ms |
| **Community Groups** | `/api/community-groups` | 7,160 | 238.47 req/sec | 58.03ms | 41ms | 135ms |
| **Payment Gateway Config** | `/api/payments/config` | 7,160 | 238.47 req/sec | 58.02ms | 41ms | 136ms |

---

## 📈 1-Minute Throughput & Stability Timeline (5-Second Windows)

| Time Window | Requests Processed | Observed RPS | Avg Latency |
| :--- | :---: | :---: | :---: |
| 0s - 5.0s | 6101 reqs | 1220.2 req/sec | 55.9 ms |
| 5s - 10.0s | 6100 reqs | 1220 req/sec | 55.8 ms |
| 10s - 15.0s | 6100 reqs | 1220 req/sec | 56.5 ms |
| 15s - 20.0s | 5325 reqs | 1065 req/sec | 64.4 ms |
| 20s - 25.1s | 5575 reqs | 1115 req/sec | 64 ms |

---

## 📌 Performance Engineering Verdict

- **Throughput Capability:** The system demonstrated sustained handling of **1192.34 req/sec** under 100 concurrent virtual users.
- **Latency Consistency:** 95% of all traffic completed in under **78ms**, meeting high-performance web application SLAs.
- **Artifacts:** Full multi-sheet breakdown generated in `excel/LoadTest_Report.xlsx`.
