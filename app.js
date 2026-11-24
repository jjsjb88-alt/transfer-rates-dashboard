"use strict";

const byId = (id) => document.getElementById(id);
const data = window.TRANSFER_DATA;
const filters = byId("filters");
const search = byId("keyword");
const school = byId("school");
const field = byId("field");
const sort = byId("sort");
const results = byId("results");
const frame = byId("table-frame");
const pagination = byId("pagination");
const detail = byId("detail");
const number = new Intl.NumberFormat("ko-KR");
const decimal = new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const korean = new Intl.Collator("ko-KR", { numeric: true });
const trackName = { general: "일반편입", bachelor: "학사편입" };
const pageSize = 24;
const currentRate = (row) => row.y26?.[2] ?? null;
const previousRate = (row) => row.y25?.[2] ?? null;
const currentCapacity = (row) => row.y26?.[0] ?? null;
const fold = (text) => text.normalize("NFC").toLocaleLowerCase("ko-KR").replace(/\s/g, "");
const rateText = (value) => value == null ? "—" : decimal.format(value);
const peopleText = (value) => value == null ? "—" : number.format(value) + "명";
const escape = (text) => String(text).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

let page = 1;
let rowsOnPage = [];
let totalPages = 1;

function change(row) {
  const oldValue = previousRate(row);
  const newValue = currentRate(row);
  return oldValue == null || newValue == null ? null : Math.round((newValue - oldValue) * 100) / 100;
}

function deltaText(value) {
  if (value == null) return "—";
  if (value > 0) return "+" + decimal.format(value);
  return decimal.format(value);
}

function provinceSort(a, b) {
  return korean.compare(a.school, b.school) || korean.compare(a.major, b.major) || korean.compare(a.field, b.field);
}

function metricSort(values, descending) {
  return (a, b) => {
    const x = values(a);
    const y = values(b);
    if (x == null && y == null) return provinceSort(a, b);
    if (x == null) return 1;
    if (y == null) return -1;
    return (descending ? y - x : x - y) || provinceSort(a, b);
  };
}

const comparators = {
  school: provinceSort,
  high: metricSort(currentRate, true),
  low: metricSort(currentRate, false),
  change: metricSort(change, true)
};

function setOptions(select, values) {
  const selected = select.value;
  select.length = 1;
  for (const value of [...new Set(values)].sort(korean.compare)) {
    if (value) select.add(new Option(value, value));
  }
  if ([...select.options].some(option => option.value === selected)) select.value = selected;
}

function showTable(row, index) {
  const delta = change(row);
  const deltaClass = delta == null ? "missing" : delta < 0 ? "delta-down" : delta > 0 ? "delta-up" : "";
  const former = row.comparison ? '<span class="former-name">2025 ' + escape(row.comparison.previousName) +
    '</span>' : row.review ? '<span class="former-name">모집단위 확인 중</span>' : '';
  return '<tr><td><span class="school-name">' + escape(row.school) +
    '</span><button class="major-link" type="button" data-index="' + index + '">' + escape(row.major) +
    '</button>' + former + '</td><td data-label="계열"><span class="field-badge">' + escape(row.field || "—") +
    '</span></td><td data-label="2025 경쟁률">' + rateText(previousRate(row)) +
    '</td><td data-label="2026 경쟁률" class="current">' + rateText(currentRate(row)) +
    '</td><td data-label="증감" class="' + deltaClass + '">' + deltaText(delta) +
    '</td><td data-label="2026 모집">' + peopleText(currentCapacity(row)) +
    '</td><td data-label="2026 전형요소" class="factor-cell">' + factorPreview(row) + noticePreview(row) + '</td></tr>';
}

function render() {
  const track = filters.elements.track.value;
  const keywords = search.value.trim().split(/\s+/).filter(Boolean).map(fold);
  const candidates = data.records.filter(row => row.track === track);
  setOptions(school, candidates.map(row => row.school));
  const atSchool = candidates.filter(row => !school.value || row.school === school.value);
  setOptions(field, atSchool.map(row => row.field));
  const filtered = atSchool.filter(row => {
    if (field.value && row.field !== field.value) return false;
    if (!keywords.length) return true;
    const text = fold([row.school, row.major, row.comparison?.previousName, row.division, row.field].join(" "));
    return keywords.every(keyword => text.includes(keyword));
  }).sort(comparators[sort.value]);

  totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  page = Math.min(page, totalPages);
  const start = (page - 1) * pageSize;
  rowsOnPage = filtered.slice(start, start + pageSize);
  results.innerHTML = rowsOnPage.map(showTable).join("");
  frame.hidden = !filtered.length;
  byId("empty").hidden = Boolean(filtered.length);
  pagination.hidden = totalPages <= 1;
  byId("previous").disabled = page <= 1;
  byId("next").disabled = page >= totalPages;
  byId("page-label").textContent = number.format(page) + " / " + number.format(totalPages);
  const comparable = filtered.filter(row => change(row) != null).length;
  byId("result-summary").textContent = trackName[track] + " · " +
    number.format(filtered.length) + "개 결과 · 두 해 비교 " + number.format(comparable) + "개";
}

const matchNames = {
  exact_major: "모집단위 일치", text_major: "모집단위 문구", dept: "학부·단과대",
  series: "계열", common: "대학 공통"
};

function plansFor(row) {
  return data.admissions[row.admission] || [];
}

const noticeFor = (row) => data.notices?.[row.notice];
const noteTopics = [
  [/동일계/, "동일계 관련"],
  [/포트폴리오/, "포트폴리오"],
  [/실기/, "실기"],
  [/가산점/, "가산점"],
  [/자격실적|경기실적|회원증명|단증|체력검사/, "자격·실적"]
];

function noticePreview(row) {
  const notice = noticeFor(row);
  if (notice) return '<span class="notice-badge">' + escape(notice.badge) + '</span>';
  const notes = plansFor(row).flatMap(plan => plan.stages.map(stage => stage.note));
  const topics = noteTopics.filter(([pattern]) => notes.some(note => note && pattern.test(note)));
  return topics.length ? '<span class="notice-hint">전형표 비고 · ' + topics.map(([, label]) => label).join(' · ') + '</span>' : '';
}

function detailNotice(row) {
  const notice = noticeFor(row);
  if (!notice) return "";
  return '<section class="admission-notice"><h3>2026학년도 지원자격·특이사항</h3><strong>' +
    escape(notice.badge) + '</strong><p>' + escape(notice.text) + '</p><a href="' + escape(notice.source) +
    '" target="_blank" rel="noopener noreferrer">' + escape(notice.sourceLabel) + '</a></section>';
}

function factorNumber(value) {
  return escape(value.replace(/^(\d+)\.0+$/, "$1"));
}

function factorValues(stage) {
  return stage.factors.map(([name, value]) => escape(name) + " " + factorNumber(value)).join(" · ");
}

function factorPreview(row) {
  const plans = plansFor(row);
  if (!plans.length) {
    return '<span class="missing">' + (row.y26 ? "연결 자료 없음" : "2026 경쟁률 행 없음") + '</span>';
  }

  const standard = plans.filter(plan => plan.label !== "우선선발");
  const priorityCount = plans.length - standard.length;
  if (standard.length !== 1) {
    const names = [...new Set(plans.flatMap(plan => plan.stages.flatMap(stage => stage.factors.map(([name]) => name))))];
    const summary = names.length ? names.map(escape).join(" · ") : "전형 안내";
    return '<span>' + summary + '</span><span class="factor-caption">' +
      (standard.length ? '반영 방식 ' + standard.length + '개' : '우선선발') + '</span>';
  }

  const plan = standard[0];
  const stages = plan.stages.filter(stage => stage.factors.length);
  const values = stages.map(stage => '<span class="factor-stage">' +
    (stages.length > 1 || stage.label === "1단계" ? '<span class="factor-caption">' + escape(stage.label) + '</span>' : '') +
    factorValues(stage) + '</span>').join("");
  return (values || '<span>전형 안내 있음</span>') +
    (priorityCount ? '<span class="factor-caption">우선선발 ' + priorityCount + '개</span>' : '');
}

function detailPlans(row) {
  const plans = plansFor(row);
  if (!plans.length) {
    return '<p class="detail-note">이 모집단위에 연결된 2026학년도 전형요소가 없습니다.</p>';
  }

  return '<p class="detail-note">반영비율·배점은 원본 표기 기준입니다.</p>' + plans.map(plan => {
    const stages = plan.stages.map(stage => {
      const weights = stage.factors.map(([name, value]) =>
        '<div><dt>' + escape(name) + '</dt><dd>' + factorNumber(value) + '</dd></div>').join("");
      const note = stage.note ? '<p class="detail-note factor-note"><strong>전형표 비고</strong> ' + escape(stage.note) + '</p>' : "";
      return '<div class="plan-stage"><h5>' + escape(stage.label) + '</h5>' +
        (weights ? '<dl class="factor-weights">' + weights + '</dl>' : '') +
        note + (weights || note ? '' : '<p class="detail-note">배점 미기재</p>') + '</div>';
    }).join("");
    return '<section class="admission-plan"><div class="plan-heading"><h4>' + escape(plan.label) +
      '</h4><span class="match-label">' + escape(matchNames[plan.match] || plan.match) + ' 연결</span></div>' +
      '<p class="plan-source">' + escape(plan.source) + '</p>' + stages + '</section>';
  }).join("");
}



function comparisonNote(row) {
  if (!row.comparison) {
    return row.review ? '<p class="detail-note">연도별 모집 범위를 확인 중이라 경쟁률 증감은 표시하지 않습니다.</p>' : "";
  }
  const { previousName, note, sources } = row.comparison;
  const links = sources.map((url, index) =>
    '<a href="' + escape(url) + '" target="_blank" rel="noopener noreferrer">근거 ' + (index + 1) + '</a>').join(" ");
  return '<p class="detail-note"><strong>2025학년도 모집단위 ' + escape(previousName) +
    '</strong><br>' + escape(note) + (links ? ' ' + links : '') + '</p>';
}


function showDetail(row) {
  const older = previousRate(row);
  const newer = currentRate(row);
  const max = Math.max(older ?? 0, newer ?? 0, 1);
  byId("detail-meta").textContent = [row.school, row.field, trackName[row.track]].filter(Boolean).join(" · ");
  byId("detail-title").textContent = row.major;
  const years = [[2025, row.y25], [2026, row.y26]];
  const comparison = years.map(([year, values]) => {
    const rate = values?.[2] ?? null;
    const current = year === 2026;
    const width = rate == null ? 0 : rate / max * 100;
    return '<div class="detail-year' + (current ? ' current-year' : '') + '"><div class="year-heading"><strong>' + year +
      '학년도</strong><span class="year-rate">' + rateText(rate) + (rate == null ? '' : '<small>대 1</small>') +
      '</span></div><div class="bar-track" aria-hidden="true"><div class="bar' + (current ? ' new' : '') +
      '" style="width:' + width + '%"></div></div><p>모집 ' + peopleText(values?.[0]) +
      '<br>지원 ' + peopleText(values?.[1]) + '</p></div>';
  }).join("");
  const warning = row.blocked ? '<p class="detail-note">같은 대학·계열·모집단위가 원본에 여러 행으로 있어 연도별 행을 개별 표시합니다.</p>' : "";
  byId("detail-content").innerHTML = detailNotice(row) + '<h3 class="detail-label">경쟁률 비교</h3><div class="detail-values">' +
    comparison + '</div>' + comparisonNote(row) + warning +
    '<h3 class="detail-label">2026학년도 전형요소</h3>' + detailPlans(row);
  detail.showModal();
}

function resetPage() {
  page = 1;
  render();
}

if (data) {
  byId("source").textContent = "원본 " + data.title + " · 2025·2026학년도 일반·학사 경쟁률 4개 시트와 전형정보 시트";
  filters.addEventListener("submit", (event) => event.preventDefault());
  filters.addEventListener("change", (event) => {
    if (event.target !== search) resetPage();
  });
  search.addEventListener("input", resetPage);
  byId("reset-filters").addEventListener("click", () => {
    filters.reset();
    resetPage();
  });
  byId("previous").addEventListener("click", () => {
    if (page > 1) {
      page--;
      render();
    }
  });
  byId("next").addEventListener("click", () => {
    if (page < totalPages) {
      page++;
      render();
    }
  });
  results.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-index]");
    if (button) showDetail(rowsOnPage[Number(button.dataset.index)]);
  });
  detail.addEventListener("click", (event) => {
    if (event.target === detail) {
      const bounds = detail.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) detail.close();
    }
  });
  render();
} else {
  byId("result-summary").textContent = "경쟁률 데이터를 불러오지 못했습니다. data.js가 같은 폴더에 있는지 확인해 주세요.";
}



