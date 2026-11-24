// Admission parsing and matching routines adapted from the supplied Apps Script v5.
// The in-memory adapter exposes the workbook values needed by the original parser.
exports.matchAdmission = function matchAdmission(rows) {
  const SHEET_전형정보 = "전형정보";
  const getSS = () => ({ getSheetByName: () => ({ getDataRange: () => ({ getValues: () => rows }) }) });
function load전형정보() {
  var ss = getSS();
  var sheet = ss.getSheetByName(SHEET_전형정보);
  if (!sheet) throw new Error('"' + SHEET_전형정보 + '" \uc2dc\ud2b8\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.');
  var raw = sheet.getDataRange().getValues();
  var hr = -1;
  for (var i = 0; i < raw.length; i++) {
    if (cln(raw[i][0]) === '\ub300\ud559\uba85') { hr = i; break; }
  }
  if (hr < 0) throw new Error('\ud5e4\ub354(\ub300\ud559\uba85) \uc2dc\ud2b8\uc5d0\uc11c \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.');

  var list = [], lu = '', lr = null;

  for (var idx = hr + 1; idx < raw.length; idx++) {
    var row = raw[idx];
    var uv = cln(row[0]);
    var c1 = cln(row[1]);
    var c2 = cln(row[2]);
    var sc = [row[3], row[4], row[5], row[6], row[7], row[8], row[9]].map(cln);
    var bigo = cln(row[10] || '');

    if (uv) lu = uv;

    // 패턴 A: 대학명 + B열이 [로 시작
    if (uv && c1.charAt(0) === '[') {
      var 편입유형A = parse_유형_A(c1);
      var extras = parse_A_extras(c1);
      lr = {
        대학명: lu, 전형방법: c1, 사정모형: c2,
        편입유형: 편입유형A,
        매칭모드: 'header_A',
        영어: sc[0], 수학: sc[1], 전공기초: sc[2],
        전적대성적: sc[3], 면접: sc[4], 공인영어: sc[5], 기타: sc[6],
        비고: bigo,
        학과목록: [],
        소속대학: [],
        계열목록: extras.series,
        header_majors: extras.majors,
        header_depts: extras.depts,
        excludes: extras.excludes,
        is_common: extras.is_common,
        단계2: null
      };
      list.push(lr);
    }
    // 패턴 B: 대학명 + B열이 [로 시작 안 함
    else if (uv && c1 && c1.charAt(0) !== '[') {
      var clsResult = classify_pattern_b(c1);
      var 편입유형B = clsResult.type;
      var primary_mode = clsResult.mode;
      var items = parse_b_items(c1);
      var excludesB = parse_excludes(c1);
      var is_common_B = primary_mode === 'common';
      var is_special = (편입유형B === '\uc6b0\uc120\uc120\ubc1c' || 편입유형B === '\ud2b9\ubcc4' || 편입유형B === '\uc7ac\uc678\uad6d\uc778');

      var 소속대학B = [], 계열목록B = [], 학과목록B = [];
      var series_suffixes = ['\uacc4\uc5f4', '\uacc4'];
      var series_keywords_in_text = ['\uc608\uccb4\ub2a5', '\uc774\uacf5', '\uc778\ubb38\uc0ac\ud68c', '\uc790\uc5f0\uacf5\ud559'];

      if (is_special) {
        학과목록B = items.slice();
      } else if (!is_common_B) {
        items.forEach(function(it) {
          var clf = it.replace(/\([^)]*\)/g, '').trim();
          var is_series = false;
          series_suffixes.forEach(function(suf) {
            if (clf.length >= suf.length && clf.substring(clf.length - suf.length) === suf) is_series = true;
          });
          if (!is_series) {
            for (var kk = 0; kk < series_keywords_in_text.length; kk++) {
              if (clf.indexOf(series_keywords_in_text[kk]) >= 0) { is_series = true; break; }
            }
          }
          if (is_series) {
            계열목록B.push(it);
          } else if (/(\ub300\ud559|\ud559\ubd80)$/.test(clf) && !/(\ud559\uacfc|\uc804\uacf5)/.test(clf)) {
            소속대학B.push(it);
          } else {
            학과목록B.push(it);
          }
        });
      }

      lr = {
        대학명: lu, 전형방법: c1, 사정모형: c2,
        편입유형: 편입유형B,
        매칭모드: '\ubcf8\ubb38_B_' + primary_mode,
        영어: sc[0], 수학: sc[1], 전공기초: sc[2],
        전적대성적: sc[3], 면접: sc[4], 공인영어: sc[5], 기타: sc[6],
        비고: bigo,
        학과목록: 학과목록B,
        소속대학: 소속대학B,
        계열목록: 계열목록B,
        header_majors: [],
        header_depts: [],
        excludes: excludesB,
        is_common: is_common_B,
        단계2: null
      };
      list.push(lr);
    }
    // 학과목록 행 (대학명 없음 + B열 있음 + C열 없음) → 직전 전형 A에 추가
    else if (!uv && c1 && !c2) {
      if (lr && lr.매칭모드 === 'header_A') {
        var addItems = parse_b_items(c1);
        for (var ai = 0; ai < addItems.length; ai++) {
          lr.학과목록.push(addItems[ai]);
        }
      }
    }
    // 2단계 행
    else if (!uv && !c1 && c2 === '\ub2e8\uacc4(2\ub2e8\uacc4)' && lr) {
      lr.단계2 = {
        영어: sc[0], 수학: sc[1], 전공기초: sc[2], 전적대성적: sc[3],
        면접: sc[4], 공인영어: sc[5], 기타: sc[6], 비고: bigo
      };
    }
    // 사정모형이 '2단계'로 표시되는 케이스 (전형정보 일부)
    else if (!uv && !c1 && c2 === '2\ub2e8\uacc4' && lr) {
      lr.단계2 = {
        영어: sc[0], 수학: sc[1], 전공기초: sc[2], 전적대성적: sc[3],
        면접: sc[4], 공인영어: sc[5], 기타: sc[6], 비고: bigo
      };
    }
  }
  return list;
}

// ============================================================
// ★ v4: 패턴 A 헤더 [] 텍스트에서 편입유형 추출
// ============================================================
function parse_유형_A(f) {
  var t = f.replace(/[\[\]]/g, '');
  if (t.indexOf('\uc6b0\uc120\uc120\ubc1c') >= 0) return '\uc6b0\uc120\uc120\ubc1c';
  if (t.indexOf('\uc7ac\uc678\uad6d\uc778') >= 0 || t.indexOf('\uc678\uad6d\uc778') >= 0) return '\uc7ac\uc678\uad6d\uc778';
  var h일 = t.indexOf('\uc77c\ubc18\ud3b8\uc785') >= 0 || t.indexOf('\uc77c\ubc18') >= 0;
  var h학 = t.indexOf('\ud559\uc0ac\ud3b8\uc785') >= 0 || t.indexOf('\ud559\uc0ac') >= 0;
  var h특 = t.indexOf('\ud2b9\ubcc4') >= 0;

  var types = [];
  if (h일) types.push('\uc77c\ubc18');
  if (h학) types.push('\ud559\uc0ac');
  if (h특) types.push('\ud2b9\ubcc4');
  if (types.length) return types.join('+');
  return '\uacf5\ud1b5';
}

// ============================================================
// ★ v4: 패턴 A 헤더에서 [] 다음의 학과/계열/단대/공통 정보 추출
// 예: "[일반편입, 학사편입] 자연과학(생활과학계열 제외), 공학계열"
//     → series:[자연과학, 공학계열], excludes:[생활과학계열]
// ============================================================
function parse_A_extras(f) {
  var after = f.replace(/\[[^\]]*\]/g, '').trim();
  var result = { series: [], majors: [], depts: [], excludes: [], is_common: false };
  if (!after) return result;

  // "(○○ 제외)" / "(○○ 외)" 추출
  var em = after.match(/\(([^)]*?)(?:\uc81c\uc678|\uc678)\)/g);
  if (em) {
    em.forEach(function(g) {
      var inner = g.replace(/^\(/, '').replace(/\)$/, '').replace(/\uc81c\uc678$|\uc678$/, '').trim();
      inner.split(',').forEach(function(it) {
        var v = it.trim();
        if (v) result.excludes.push(v);
      });
    });
  }

  var cleaned = after.replace(/\([^)]*?(?:\uc81c\uc678|\uc678)\)/g, '').trim();
  var items = cleaned.split(',').map(function(s){return s.trim();}).filter(function(s){return s;});

  var common_keywords = ['\uacf5\ud1b5', '\uc804\uccb4', '\uc804 \ubaa8\uc9d1\ub2e8\uc704', '\uc804 \ub300\ud559 \ubaa8\uc9d1\ub2e8\uc704'];
  var series_keywords = ['\uc778\ubb38\uacc4\uc5f4', '\uc790\uc5f0\uacc4\uc5f4', '\uc778\ubb38\uacc4', '\uc790\uc5f0\uacc4', '\uc608\uccb4\ub2a5\uacc4',
                         '\uc608\ub2a5\uacc4', '\uccb4\ub2a5\uacc4', '\uc778\ubb38\uc0ac\ud68c\uacc4\uc5f4', '\uc790\uc5f0\uacf5\ud559\uacc4\uc5f4',
                         '\uacf5\ud559\uacc4\uc5f4', '\uc790\uc5f0\uacfc\ud559', '\uc774\uacf5\uacc4', '\uc0dd\ud65c\uacfc\ud559\uacc4\uc5f4',
                         '\uc778\ubb38', '\uc0ac\ud68c\uacfc\ud559'];

  items.forEach(function(it) {
    var matched = false;
    for (var k = 0; k < common_keywords.length; k++) {
      if (it.indexOf(common_keywords[k]) >= 0) {
        result.is_common = true;
        matched = true;
        break;
      }
    }
    if (matched) return;

    if (/(\ub300\ud559|\ud559\ubd80)$/.test(it) && !/(\ud559\uacfc|\uc804\uacf5)/.test(it)) {
      result.depts.push(it);
      return;
    }

    for (var s = 0; s < series_keywords.length; s++) {
      if (it.indexOf(series_keywords[s]) >= 0) {
        result.series.push(it);
        matched = true;
        break;
      }
    }
    if (matched) return;

    result.majors.push(it);
  });

  return result;
}

// ============================================================
// ★ v4: 패턴 B 분류
// ============================================================
function classify_pattern_b(b_text) {
  var t = b_text;

  // 특수 키워드 우선
  if (t.indexOf('\uc6b0\uc120\uc120\ubc1c') >= 0) return { type: '\uc6b0\uc120\uc120\ubc1c', mode: 'major' };
  if (t.indexOf('\uc7ac\uc678\uad6d\uc778') >= 0 || t.indexOf('\uc678\uad6d\uc778') >= 0) return { type: '\uc7ac\uc678\uad6d\uc778', mode: 'major' };
  if (t.indexOf('\uad70\uc704\ud0c1') >= 0) return { type: '\ud2b9\ubcc4', mode: 'major' };
  if (t.indexOf('\uacf5\ubb34\uc6d0\uc704\ud0c1') >= 0) return { type: '\ud2b9\ubcc4', mode: 'major' };
  if (t.indexOf('\uc7ac\uc9c1\uacbd\ucc30\uad00') >= 0) return { type: '\ud2b9\ubcc4', mode: 'major' };
  if (t.indexOf('\uc7ac\uc9c1\uc790') >= 0) return { type: '\ud2b9\ubcc4', mode: 'major' };

  // 공통/전체
  var common_keys = ['\uacf5\ud1b5', '\uc804\uccb4', '\uc77c\ubc18\ud559\uacfc', '\uba74\uc811 \ubbf8\uc2e4\uc2dc', '\uba74\uc811 \uc2e4\uc2dc', '\uc804 \ub300\ud559 \ubaa8\uc9d1\ub2e8\uc704', '\uc804 \ubaa8\uc9d1\ub2e8\uc704'];
  for (var c = 0; c < common_keys.length; c++) {
    if (t.indexOf(common_keys[c]) >= 0) return { type: '\uc77c\ubc18+\ud559\uc0ac', mode: 'common' };
  }

  // 아이템 단위 dept/series/major 카운트
  var items = parse_b_items(t);
  var dept_count = 0, series_count = 0, major_count = 0;
  var series_suffixes = ['\uacc4\uc5f4', '\uacc4'];
  var series_keywords = ['\uc608\uccb4\ub2a5', '\uc774\uacf5', '\uc778\ubb38\uc0ac\ud68c', '\uc790\uc5f0\uacf5\ud559'];

  items.forEach(function(it) {
    var clf = it.replace(/\([^)]*\)/g, '').trim();
    var is_series = false;
    series_suffixes.forEach(function(suf) {
      if (clf.length >= suf.length && clf.substring(clf.length - suf.length) === suf) is_series = true;
    });
    if (!is_series) {
      for (var kk = 0; kk < series_keywords.length; kk++) {
        if (clf.indexOf(series_keywords[kk]) >= 0) { is_series = true; break; }
      }
    }
    if (is_series) {
      series_count++;
    } else if (/(\ub300\ud559|\ud559\ubd80)$/.test(clf) && !/(\ud559\uacfc|\uc804\uacf5)/.test(clf)) {
      dept_count++;
    } else {
      major_count++;
    }
  });

  if (dept_count > 0 && dept_count >= series_count && dept_count >= major_count) {
    return { type: '\uc77c\ubc18+\ud559\uc0ac', mode: 'dept' };
  }
  if (series_count > 0 && series_count >= major_count) {
    return { type: '\uc77c\ubc18+\ud559\uc0ac', mode: 'series' };
  }
  return { type: '\uc77c\ubc18+\ud559\uc0ac', mode: 'major' };
}

// ============================================================
// 헬퍼: B열 아이템 분리 ([] 제거 후 쉼표 분리)
// ============================================================
function parse_b_items(b_text) {
  var t = b_text.replace(/\[[^\]]*\]/g, '').trim();
  return t.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; });
}

// ============================================================
// 헬퍼: "(○○ 제외)" 추출
// ============================================================
function parse_excludes(text) {
  var result = [];
  var matches = text.match(/\(([^)]*?)(?:\uc81c\uc678|\uc678)\)/g);
  if (matches) {
    matches.forEach(function(g) {
      var inner = g.replace(/^\(/, '').replace(/\)$/, '').replace(/\uc81c\uc678$|\uc678$/, '').trim();
      inner.split(',').forEach(function(it) {
        var v = it.trim();
        if (v) result.push(v);
      });
    });
  }
  return result;
}

// ============================================================
// ★ v4: 인덱스 빌드
// ============================================================
function build전형Index(list) {
  var byUniv = {};
  list.forEach(function(t) {
    var uk = nrm(t.대학명);
    if (!byUniv[uk]) byUniv[uk] = [];
    byUniv[uk].push(t);
  });
  return { byUniv: byUniv };
}

// ============================================================
// ★ v4: find전형 — 5단계 매칭 알고리즘
// 매칭 우선순위:
//   1) exact_major : 학과목록(B) 또는 header_majors(A) 정확 일치
//   2) text_major  : 전형방법 텍스트에 모집단위 포함
//   3) dept        : 학부 칼럼과 소속대학/header_depts 일치
//   4) series      : 계열목록과 계열 일치 (반대 계열 차단)
//   5) common      : is_common 행 (excludes 체크)
// ============================================================
function find전형(대학, 모집단위, 계열, 학부, idx) {
  var uk = nrm(대학);
  var univs = idx.byUniv[uk] || [];
  if (!univs.length) return { list: [], type: 'none' };

  var mj = nrm(모집단위);
  var mj2 = mj.replace(/\([^)]*\)/g, '');
  var 학부n = 학부 ? nrm(학부) : '';

  function excluded(t) {
    var exs = t.excludes || [];
    for (var i = 0; i < exs.length; i++) {
      var exn = nrm(exs[i]);
      if (!exn) continue;
      if (exn.indexOf(mj) >= 0 || mj.indexOf(exn) >= 0) return true;
      if (학부n && (exn.indexOf(학부n) >= 0 || 학부n.indexOf(exn) >= 0)) return true;
    }
    return false;
  }

  // 1) exact_major
  var exact = [];
  univs.forEach(function(t) {
    if (excluded(t)) return;
    var hit = false;
    (t.학과목록 || []).forEach(function(m) { if (nrm(m) === mj) hit = true; });
    if (!hit) (t.header_majors || []).forEach(function(m) { if (nrm(m) === mj) hit = true; });
    if (hit) exact.push(t);
  });
  if (exact.length) return { list: exact, type: 'exact_major' };

  // 2) text_major
  var text = [];
  univs.forEach(function(t) {
    if (excluded(t)) return;
    var tf = nrm(t.전형방법);
    if (tf && (tf.indexOf(mj) >= 0 || (mj2.length > 1 && tf.indexOf(mj2) >= 0))) {
      text.push(t);
    }
  });
  if (text.length) return { list: text, type: 'text_major' };

  // 3) dept (학부 매칭)
  if (학부n && 학부n !== '-') {
    var deptMatched = [];
    univs.forEach(function(t) {
      if (excluded(t)) return;
      var depts = (t.소속대학 || []).concat(t.header_depts || []);
      for (var d = 0; d < depts.length; d++) {
        var dn = nrm(depts[d]);
        if (dn && (dn === 학부n || dn.indexOf(학부n) >= 0 || 학부n.indexOf(dn) >= 0)) {
          deptMatched.push(t);
          return;
        }
      }
    });
    if (deptMatched.length) return { list: deptMatched, type: 'dept' };
  }

  // 4) series (계열 매칭, 반대 계열 차단)
  function hasOppositeInList(seriesList, target) {
    for (var i = 0; i < seriesList.length; i++) {
      var sn = nrm(seriesList[i].replace(/\([^)]*\)/g, ''));
      if (target === '\uc790\uc5f0') {
        if (sn.indexOf('\uc778\ubb38') >= 0 || sn.indexOf('\uc0ac\ud68c\uacc4') >= 0) return true;
      } else if (target === '\uc778\ubb38') {
        if ((sn.indexOf('\uc790\uc5f0') >= 0 && sn.indexOf('\uc790\uc5f0\uacfc\ud559') < 0) ||
            sn.indexOf('\uacf5\ud559') >= 0 || sn.indexOf('\uc774\uacf5') >= 0) return true;
      }
    }
    return false;
  }

  var seriesMatched = [];
  univs.forEach(function(t) {
    if (excluded(t)) return;
    var allSeries = t.계열목록 || [];
    if (!allSeries.length) return;
    if (hasOppositeInList(allSeries, 계열)) return;

    for (var s = 0; s < allSeries.length; s++) {
      var sn = nrm(allSeries[s].replace(/\([^)]*\)/g, ''));
      if (계열 === '\uc778\ubb38') {
        if (sn.indexOf('\uc778\ubb38') >= 0 || sn.indexOf('\uc0ac\ud68c') >= 0) {
          seriesMatched.push(t); return;
        }
      } else if (계열 === '\uc790\uc5f0') {
        if (sn.indexOf('\uc790\uc5f0') >= 0 || sn.indexOf('\uacf5\ud559') >= 0 ||
            sn.indexOf('\uc774\uacf5') >= 0 || sn.indexOf('\uacfc\ud559') >= 0) {
          seriesMatched.push(t); return;
        }
      } else if (계열 === '\uc608\uccb4\ub2a5') {
        var kws = ['\uc608', '\uccb4', '\ubbf8\uc220', '\uc74c\uc545', '\ub514\uc790\uc778'];
        for (var k = 0; k < kws.length; k++) {
          if (sn.indexOf(kws[k]) >= 0) { seriesMatched.push(t); return; }
        }
      }
    }
  });
  if (seriesMatched.length) return { list: seriesMatched, type: 'series' };

  // 5) common
  var common = [];
  univs.forEach(function(t) {
    if (t.is_common && !excluded(t)) common.push(t);
  });
  if (common.length) return { list: common, type: 'common' };

  return { list: [], type: 'none' };
}

// ============================================================
// 경쟁률 시트 로딩
// ============================================================
function cln(v) {
  return String(v != null ? v : '').replace(/\xa0/g, '').trim();
}

function nrm(s) {
  return cln(s).replace(/\s/g, '');
}

// ============================================================
// v5 학과명 매칭: 핵심 어근 기반 (공통 2글자 이상)
// ============================================================
// 학과명에서 의미 없는 접미사("학과","학부","전공","과","부","(야)" 등)와 
// 캠퍼스/계열 괄호, 밑줄 뒤 부분 등을 제거해 핵심 어근만 추출.
//   "경영학부"           → "경영"
//   "경영학과"           → "경영"
//   "경영학전공_수학"     → "경영"
//   "글로벌경영전공"      → "글로벌경영"
//   "AI응용학과(야)"     → "AI응용"
//   "간호학과"           → "간호"
// ============================================================
function getCoreMajor(major) {
  if (!major) return '';
  var s = nrm(major);
  
  // 1) 슬래시 뒤(세부전공) 제거
  if (s.indexOf('/') >= 0) s = s.split('/')[0];
  
  // 2) 밑줄 뒤(_수학/_영어 같은 분리표시) 제거
  if (s.indexOf('_') >= 0) s = s.split('_')[0];
  
  // 3) 괄호 안 부분(인문/자연/야간/캠퍼스) 제거
  s = s.replace(/\([^\)]*\)/g, '');
  
  // 4) 일반 접미사 제거 (긴 것부터)
  var suffixes = ['\ud559\ubd80', '\ud559\uacfc', '\uc804\uacf5', '\ub300\ud559',
                  '\ub300\ud559\uc6d0', '\uacfc', '\ubd80'];
  // 학부, 학과, 전공, 대학, 대학원, 과, 부
  for (var i = 0; i < suffixes.length; i++) {
    var suf = suffixes[i];
    if (s.length > suf.length + 1 && s.indexOf(suf, s.length - suf.length) >= 0) {
      s = s.substring(0, s.length - suf.length);
    }
  }
  
  return s;
}

// 두 학과명이 매칭되는지 — 핵심 어근 기준 공통 부분 문자열 2글자 이상
function isMajorMatch(target, candidate) {
  var t = getCoreMajor(target);
  var c = getCoreMajor(candidate);
  if (!t || !c) return false;
  
  // 핵심 어근이 짧으면 (1글자) 정확 일치만
  if (t.length < 2 || c.length < 2) {
    return t === c;
  }
  
  // 포함 관계
  if (c.indexOf(t) >= 0) return true;
  if (t.indexOf(c) >= 0) return true;
  
  // 공통 부분 문자열 2글자 이상 찾기
  // t의 모든 2글자 부분문자열을 c에서 검색
  for (var i = 0; i <= t.length - 2; i++) {
    var sub = t.substring(i, i + 2);
    if (c.indexOf(sub) >= 0) return true;
  }
  return false;
}

// ============================================================
// v5 백엔드 API 레이어 (단계 1 v5 - 최종)
// ============================================================
// v4 → v5 변경사항:
//   1) ⚠️ 마커: 모집 7명↓ OR 경쟁률 50:1↑
//   2) 우선선발 제외: 학과명에 "우선선발" 포함도 체크
//   3) 상명대 7티어에서 제거 (학원 비대비)
//   4) 경찰대, 육군3사관 명시적 EXCLUDED_SCHOOLS 처리
// ============================================================

// ============================================================
// 1) 웹앱 진입점
// ============================================================

  const alternatives = {
    general: "일반",
    bachelor: "학사"
  };
  const rules = load전형정보();

  function indexFor(track, priority = false) {
    const label = alternatives[track];
    return build전형Index(rules.filter((rule) => {
      const types = rule.편입유형.split("+");
      if (priority) {
        return types.includes("우선선발") && rule.전형방법.includes(label + "편입");
      }
      return types.includes(label) || types.includes("공통");
    }));
  }

  const indexes = Object.fromEntries(Object.keys(alternatives).map((track) => [
    track, { regular: indexFor(track), priority: indexFor(track, true) }
  ]));

  const factors = [
    ["영어", "영어"], ["수학", "수학"], ["전공기초", "전공·계열기초"],
    ["전적대성적", "전적대 성적"], ["면접", "면접"], ["공인영어", "공인영어"], ["기타", "기타"]
  ];

  function stageOf(rule, label) {
    return {
      label,
      factors: factors.flatMap(([key, title]) => rule[key] ? [[title, rule[key]]] : []),
      note: rule.비고 || ""
    };
  }

  function plansOf(result, label) {
    const plans = result.list.map((rule) => ({
      label, match: result.type, source: rule.전형방법,
      stages: [
        stageOf(rule, rule.단계2 ? "1단계" : rule.사정모형 || "반영요소"),
        ...(rule.단계2 ? [stageOf(rule.단계2, "2단계")] : [])
      ]
    }));
    return [...new Map(plans.map((plan) => [JSON.stringify(plan), plan])).values()];
  }

  return (track, school, major, field, division) => {
    const { regular, priority } = indexes[track];
    const standard = find전형(school, major, field, division, regular);
    const early = find전형(school, major, field, division, priority);
    return [
      ...plansOf(standard, alternatives[track] + "편입"),
      ...plansOf(early, "우선선발")
    ];
  };
};

