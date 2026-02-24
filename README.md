# BusTrack — Bus Tracking System

A real-time urban transportation tracking system for the city of Almaty, built as an institutional information system with role-based access control and H3 spatial indexing.

---

## How to Run the System

### Requirements

- Node.js
- npm

### Installation

```bash
# 1. Clone or unzip the project
cd bustrack

# 2. Install dependencies
npm install

# 3. Start the server
node server.js
```

### Access

- **Web UI:** http://localhost:3000
- **API Base:** http://localhost:3000/api

### Default Credentials

| Username | Password | Role  |
| -------- | -------- | ----- |
| admin    | admin123 | admin |
| user1    | user123  | user  |

---

## Group Member Roles

| Name          | Role      |
| ------------- | --------- |
| [Aknur]       | Developer |
| [Nurmuhammed] | Developer |

---

## How H3 is Used in the System

[H3](https://h3geo.org/) is Uber's hexagonal hierarchical geospatial indexing system. In BusTrack, H3 is integrated at **resolution level 9** (cell area ≈ 0.1 km²).

### 1. Spatial Indexing on Insert

When a bus or stop is added with coordinates, its H3 cell index is automatically computed and stored:

```javascript
const h3_index = latLngToCell(latitude, longitude, 9);
// stored in buses.h3_index and stops.h3_index
```

### 2. Nearby Bus Search (gridDisk)

When a user selects a stop, the system searches for buses within N rings of hexagons using `gridDisk()`:

```javascript
const cells = gridDisk(stop.h3_index, rings);
const buses = db
  .prepare(`SELECT * FROM buses WHERE h3_index IN (${cells.map(() => '?').join(',')})`)
  .all(...cells);
```

This replaces expensive distance calculations (no `sqrt`, no Haversine) with simple string index matching — fast and scalable.

### 3. Analytics Aggregation

The `analytics_h3` table aggregates how many buses and stops exist per H3 cell:

```
h3_index (PK) | bus_count | stop_count | last_update
```

This enables heatmap-style analysis of urban coverage density per hexagonal zone.

## API Endpoints

| Method | Endpoint                         | Access | Description                        |
| ------ | -------------------------------- | ------ | ---------------------------------- |
| POST   | `/api/auth/login`                | Public | Login, returns JWT                 |
| GET    | `/api/buses`                     | All    | List all buses                     |
| POST   | `/api/buses`                     | Admin  | Add new bus (with H3)              |
| DELETE | `/api/buses/:id`                 | Admin  | Delete bus                         |
| POST   | `/api/buses/:id/update-position` | Admin  | Update bus GPS + H3 (event-driven) |
| GET    | `/api/stops`                     | All    | List all stops                     |
| POST   | `/api/stops`                     | Admin  | Add new stop (with H3)             |
| DELETE | `/api/stops/:id`                 | Admin  | Delete stop                        |
| GET    | `/api/stops/:id/nearby-buses`    | All    | H3 proximity search                |
| GET    | `/api/analytics/h3`              | All    | H3 cell statistics                 |
| POST   | `/api/analytics/h3/refresh`      | Admin  | Recalculate analytics              |
| GET    | `/api/audit`                     | Admin  | View audit logs                    |

---

## Database Schema

```
users        — id, username, password, role, full_name, is_active
buses        — id, plate_number, model, capacity, latitude, longitude, h3_index, status
stops        — id, name, address, latitude, longitude, h3_index
audit_logs   — id, username, action, resource, details, ip, success, created_at
analytics_h3 — h3_index (PK), bus_count, stop_count, last_update

```

---

## Project Structure

```
bustrack/
├── server.js
├── config.js
├── package.json
├── README.md
├── public/
│   ├── index.html
│   ├── style.css
│   └── script.js
└── src/
    ├── db/
    │   └── database.js
    ├── middleware/
    │   └── auth.js
    └── routes/
        ├── auth.js
        ├── buses.js
        ├── stops.js
        ├── analytics.js
        └── audit.js
```
