const API = '/api';
let token = null,
  role = null,
  map,
  bm = {},
  sm = {};

map = L.map('map').setView([43.25, 76.94], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap',
  maxZoom: 19,
}).addTo(map);

// - Fetch -
async function api(path, method = 'GET', body = null) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = 'Bearer ' + token;
  const r = await fetch(API + path, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : null,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Ошибка');
  return d;
}

function ql(u, p) {
  document.getElementById('iu').value = u;
  document.getElementById('ip').value = p;
  login();
}

// ── Авторизация ──
async function login() {
  const u = document.getElementById('iu').value.trim();
  const p = document.getElementById('ip').value.trim();
  const e = document.getElementById('lerr');
  e.style.display = 'none';
  try {
    const r = await api('/auth/login', 'POST', { username: u, password: p });
    token = r.token;
    role = r.role;

    const chip = document.getElementById('user-chip');
    chip.textContent = (r.full_name || r.username) + ' · ' + r.role;
    chip.classList.add('on');
    document.getElementById('lout').classList.add('on');

    const isAdmin = role === 'admin';
    document.getElementById('nav-audit').style.display = isAdmin ? '' : 'none';
    document.getElementById('nav-analytics').style.display = isAdmin ? '' : 'none';
    document.getElementById('bus-form').style.display = isAdmin ? '' : 'none';
    document.getElementById('stop-form').style.display = isAdmin ? '' : 'none';

    toast('Добро пожаловать, ' + (r.full_name || r.username) + '!');
    await loadAll();
    showPanel('buses');
  } catch (err) {
    e.textContent = '⚠ ' + err.message;
    e.style.display = 'block';
  }
}

function logout() {
  token = null;
  role = null;
  document.getElementById('user-chip').classList.remove('on');
  document.getElementById('lout').classList.remove('on');
  document.getElementById('nav-audit').style.display = 'none';
  document.getElementById('nav-analytics').style.display = 'none'; // ← новое
  document.getElementById('bus-form').style.display = 'none';
  document.getElementById('stop-form').style.display = 'none';
  ['buses-list', 'stops-list', 'audit-list', 'analytics-list'].forEach(
    (id) => (document.getElementById(id).innerHTML = '<div class="no-data">Сначала войдите</div>'),
  );
  document.getElementById('nearby-panel').classList.remove('on');
  Object.values(bm).forEach((m) => map.removeLayer(m));
  bm = {};
  Object.values(sm).forEach((m) => map.removeLayer(m));
  sm = {};
  showPanel('login');
}

async function loadAll() {
  const [buses, stops] = await Promise.all([api('/buses'), api('/stops')]);
  renderBuses(buses);
  renderStops(stops);
  if (role === 'admin') {
    loadAudit();
    loadAnalytics();
  }
}

// ── Автобусы ──
async function addBus() {
  const plate = document.getElementById('b-plate').value.trim();
  const model = document.getElementById('b-model').value.trim();
  const cap = parseInt(document.getElementById('b-cap').value) || 50;
  const lat = document.getElementById('b-lat').value;
  const lng = document.getElementById('b-lng').value;
  if (!plate) {
    toast('Введите номер автобуса', true);
    return;
  }
  const body = { plate_number: plate, model, capacity: cap };
  if (lat && lng) {
    body.latitude = Number(lat);
    body.longitude = Number(lng);
  }
  try {
    await api('/buses', 'POST', body);
    ['b-plate', 'b-model', 'b-cap', 'b-lat', 'b-lng'].forEach(
      (id) => (document.getElementById(id).value = ''),
    );
    toast('✓ Автобус добавлен');
    renderBuses(await api('/buses'));
  } catch (err) {
    toast(err.message, true);
  }
}

async function deleteBus(id, plate) {
  if (!confirm(`Удалить автобус ${plate}?`)) return;
  try {
    await api('/buses/' + id, 'DELETE');
    toast('✓ Автобус удалён');
    renderBuses(await api('/buses'));
  } catch (err) {
    toast(err.message, true);
  }
}

// ── Выбор координат на карте ──
let pickingMode = null;

function pickCoords(type) {
  pickingMode = type;
  toast('🗺 Кликните на карту для выбора точки');
  map.getContainer().style.cursor = 'crosshair';
}

map.on('click', function (e) {
  if (!pickingMode) return;
  const { lat, lng } = e.latlng;
  const latFixed = lat.toFixed(6);
  const lngFixed = lng.toFixed(6);
  if (pickingMode === 'bus') {
    document.getElementById('b-lat').value = latFixed;
    document.getElementById('b-lng').value = lngFixed;
    showPanel('buses');
  } else if (pickingMode === 'stop') {
    document.getElementById('s-lat').value = latFixed;
    document.getElementById('s-lng').value = lngFixed;
    showPanel('stops');
  }
  toast(`✓ Координаты: ${latFixed}, ${lngFixed}`);
  map.getContainer().style.cursor = '';
  pickingMode = null;
});

function renderBuses(buses) {
  const isAdmin = role === 'admin';
  document.getElementById('buses-list').innerHTML =
    buses
      .map(
        (b, i) => `
        <div class="card" style="animation-delay:${i * 40}ms" onclick="flyTo(${b.latitude},${b.longitude})">
          <span class="badge ${b.status === 'on_route' ? 'bg' : 'bgr'}">${b.status === 'on_route' ? '🟢 В пути' : '⚪ Стоит'}</span>
          <div class="card-title">${b.plate_number}</div>
          <div class="card-sub">${b.model || '—'} · ${b.capacity} мест</div>
          ${b.h3_index ? `<span class="card-h3">H3: ${b.h3_index}</span>` : ''}
          ${isAdmin ? `<button class="del-btn" onclick="event.stopPropagation();deleteBus(${b.id},'${b.plate_number}')">🗑 Удалить</button>` : ''}
        </div>`,
      )
      .join('') || '<div class="no-data">Нет автобусов</div>';

  Object.values(bm).forEach((m) => map.removeLayer(m));
  bm = {};
  buses.forEach((b) => {
    if (!b.latitude) return;
    const col = b.status === 'on_route' ? '#16a34a' : '#94a3b8';
    const m = L.marker([b.latitude, b.longitude], {
      icon: L.divIcon({
        html: `<div style="background:#fff;border:3px solid ${col};border-radius:12px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 4px 14px ${col}55">🚌</div>`,
        className: '',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      }),
    }).addTo(map).bindPopup(`
          <div class="pt">🚌 ${b.plate_number}</div>
          <div class="pr">Модель: ${b.model || '—'}</div>
          <div class="pr">Вместимость: ${b.capacity} чел.</div>
          <div class="pr">Статус: ${b.status === 'on_route' ? '🟢 В пути' : '⚪ Стоит'}</div>
          ${b.h3_index ? `<div class="ph3">H3[9]: ${b.h3_index}</div>` : ''}
        `);
    bm[b.id] = m;
  });
}

// ── Остановки ──
async function addStop() {
  const name = document.getElementById('s-name').value.trim();
  const addr = document.getElementById('s-addr').value.trim();
  const lat = document.getElementById('s-lat').value;
  const lng = document.getElementById('s-lng').value;
  if (!name || !lat || !lng) {
    toast('Заполните все поля', true);
    return;
  }
  try {
    await api('/stops', 'POST', {
      name,
      address: addr,
      latitude: Number(lat),
      longitude: Number(lng),
    });
    ['s-name', 's-addr', 's-lat', 's-lng'].forEach(
      (id) => (document.getElementById(id).value = ''),
    );
    toast('✓ Остановка добавлена');
    renderStops(await api('/stops'));
  } catch (err) {
    toast(err.message, true);
  }
}

async function deleteStop(id, name) {
  if (!confirm(`Удалить остановку "${name}"?`)) return;
  try {
    await api('/stops/' + id, 'DELETE');
    toast('✓ Остановка удалена');
    renderStops(await api('/stops'));
  } catch (err) {
    toast(err.message, true);
  }
}

function renderStops(stops) {
  const isAdmin = role === 'admin';
  document.getElementById('stops-list').innerHTML =
    stops
      .map(
        (s, i) => `
        <div class="card stop" style="animation-delay:${i * 40}ms" onclick="selStop(${s.id},${s.latitude},${s.longitude},'${s.name}')">
          <span class="badge bb">📍 Остановка</span>
          <div class="card-title">${s.name}</div>
          <div class="card-sub">${s.address || '—'}</div>
          ${s.h3_index ? `<span class="card-h3">H3: ${s.h3_index}</span>` : ''}
          ${isAdmin ? `<button class="del-btn" onclick="event.stopPropagation();deleteStop(${s.id},'${s.name}')">🗑 Удалить</button>` : ''}
        </div>`,
      )
      .join('') || '<div class="no-data">Нет остановок</div>';

  Object.values(sm).forEach((m) => map.removeLayer(m));
  sm = {};
  stops.forEach((s) => {
    const m = L.marker([s.latitude, s.longitude], {
      icon: L.divIcon({
        html: '<div style="background:#fff;border:3px solid #2563eb;border-radius:50%;width:16px;height:16px;box-shadow:0 2px 8px rgba(37,99,235,.4)"></div>',
        className: '',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
    }).addTo(map).bindPopup(`
          <div class="pt">📍 ${s.name}</div>
          <div class="pr">${s.address || ''}</div>
          ${s.h3_index ? `<div class="ph3">H3[9]: ${s.h3_index}</div>` : ''}
          <a class="pnb" onclick="selStop(${s.id},${s.latitude},${s.longitude},'${s.name}');return false" href="#">🔍 Найти ближайшие автобусы</a>
        `);
    m.on('click', () => selStop(s.id, s.latitude, s.longitude, s.name));
    sm[s.id] = m;
  });
}

async function selStop(id, lat, lng, name) {
  showPanel('stops');
  flyTo(lat, lng);
  try {
    const r = await api(`/stops/${id}/nearby-buses`);
    document.getElementById('nearby-panel').classList.add('on');
    document.getElementById('nmeta').textContent =
      name + ' · поиск в ' + r.cells_searched + ' H3 ячейках';
    document.getElementById('nlist').innerHTML = r.nearby_buses.length
      ? r.nearby_buses
          .map(
            (b) => `
              <div class="nb">
                <div class="nb-icon">🚌</div>
                <div>
                  <div class="nb-plate">${b.plate_number}</div>
                  <div class="nb-info">${b.model || '—'} · ${b.status === 'on_route' ? '🟢 В пути' : '⚪ Стоит'}</div>
                  ${b.h3_index ? `<div class="nb-h3">H3: ${b.h3_index}</div>` : ''}
                </div>
              </div>`,
          )
          .join('')
      : '<div style="text-align:center;color:#92400e;font-weight:700;padding:10px">Нет автобусов рядом 😔</div>';
    toast('🔍 Найдено ' + r.nearby_buses.length + ' автобусов рядом');
  } catch (err) {
    toast(err.message, true);
  }
}

// ── Аудит ──
async function loadAudit() {
  try {
    const logs = await api('/audit');
    document.getElementById('audit-list').innerHTML =
      logs
        .map(
          (l, i) => `
          <div class="log-card" style="animation-delay:${i * 30}ms">
            <div class="${l.success ? 'log-ok' : 'log-fail'}">${l.success ? '✓' : '✗'} ${l.action}</div>
            <div class="log-meta">${l.username} · ${l.resource || ''}</div>
            ${l.details ? `<div class="log-meta">${l.details}</div>` : ''}
            <div class="log-meta" style="color:#94a3b8">${l.created_at}</div>
          </div>`,
        )
        .join('') || '<div class="no-data">Логов нет</div>';
  } catch (err) {
    document.getElementById('audit-list').innerHTML =
      '<div class="no-data">' + err.message + '</div>';
  }
}

// ── Аналитика H3 ──
async function loadAnalytics() {
  try {
    const rows = await api('/analytics/h3');
    if (!rows.length) {
      document.getElementById('analytics-list').innerHTML =
        '<div class="no-data">Нет данных — нажмите обновить</div>';
      return;
    }
    const totalBuses = rows.reduce((s, r) => s + r.bus_count, 0);
    const totalStops = rows.reduce((s, r) => s + r.stop_count, 0);
    document.getElementById('analytics-list').innerHTML =
      `<div class="a-total">
            <div class="a-total-item"><div class="a-total-num">${rows.length}</div><div class="a-total-lbl">H3 ячеек</div></div>
            <div class="a-total-item"><div class="a-total-num">${totalBuses}</div><div class="a-total-lbl">Автобусов</div></div>
            <div class="a-total-item"><div class="a-total-num">${totalStops}</div><div class="a-total-lbl">Остановок</div></div>
          </div>` +
      rows
        .map(
          (r, i) => `
            <div class="a-card" style="animation-delay:${i * 30}ms">
              <div class="a-hex">${r.h3_index}</div>
              <div style="flex:1">
                <div class="a-stats">
                  <span class="a-stat bus">🚌 ${r.bus_count} авт.</span>
                  <span class="a-stat stop">📍 ${r.stop_count} ост.</span>
                </div>
                <div class="a-time">Обновлено: ${r.last_update}</div>
              </div>
            </div>`,
        )
        .join('');
  } catch (err) {
    document.getElementById('analytics-list').innerHTML =
      '<div class="no-data">' + err.message + '</div>';
  }
}

async function refreshAnalytics() {
  try {
    const r = await api('/analytics/h3/refresh', 'POST');
    toast('✓ ' + r.message + ' · ' + r.cells + ' ячеек');
    await loadAnalytics();
  } catch (err) {
    toast(err.message, true);
  }
}

// ── Утилиты ──
function showPanel(name) {
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  const map2 = { login: 'вход', buses: 'авто', stops: 'оста', audit: 'ауд', analytics: 'h3' };
  document.querySelectorAll('.nav-btn').forEach((b) => {
    if (b.textContent.toLowerCase().includes(map2[name])) b.classList.add('active');
  });
  if (name === 'audit' && token && role === 'admin') loadAudit();
  if (name === 'analytics' && token && role === 'admin') loadAnalytics();
}

function flyTo(lat, lng) {
  if (lat && lng) map.flyTo([lat, lng], 15, { animate: true, duration: 0.8 });
}

let tt;
function toast(msg, isErr = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'on' + (isErr ? ' err' : '');
  clearTimeout(tt);
  tt = setTimeout(() => (el.className = ''), 3500);
}
