"""Read the five source sheets without editing or recalculating the workbook."""
import json
import posixpath
import re
import sys
from xml.etree import ElementTree as ET
from zipfile import ZipFile

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
SHEETS = ("전형정보", "경쟁률2025", "경쟁률2026", "경쟁률2025_학사", "경쟁률2026_학사")


def tag(name):
    return f"{{{MAIN}}}{name}"


def column_index(cell):
    letters = re.match(r"[A-Z]+", cell.attrib["r"]).group()
    column = 0
    for letter in letters:
        column = column * 26 + ord(letter) - ord("A") + 1
    return column - 1


def read_workbook(path):
    with ZipFile(path) as workbook:
        index = ET.fromstring(workbook.read("xl/workbook.xml"))
        relationships = ET.fromstring(workbook.read("xl/_rels/workbook.xml.rels"))
        targets = {item.get("Id"): item.get("Target") for item in relationships}
        names = {sheet.get("name"): sheet.get(f"{{{REL}}}id") for sheet in index.find(tag("sheets"))}
        strings = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            pool = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
            strings = ["".join(t.text or "" for t in value.iter(tag("t"))) for value in pool]

        output = {}
        for name in SHEETS:
            target = targets[names[name]]
            location = target.lstrip("/") if target.startswith("/") else posixpath.normpath(f"xl/{target}")
            sheet = ET.fromstring(workbook.read(location))
            columns = 11 if name == "전형정보" else 7
            values = []
            for row in sheet.find(tag("sheetData")):
                value = [""] * columns
                for cell in row.findall(tag("c")):
                    column = column_index(cell)
                    if column >= columns:
                        continue
                    raw = cell.findtext(tag("v"), default="")
                    kind = cell.get("t")
                    if kind == "s" and raw:
                        raw = strings[int(raw)]
                    elif kind == "inlineStr":
                        raw = "".join(t.text or "" for t in cell.iter(tag("t")))
                    elif kind == "e":
                        raw = ""
                    value[column] = raw
                if any(value):
                    values.append(value)
            output[name] = values
        return output


if __name__ == "__main__":
    print(json.dumps(read_workbook(sys.argv[1]), ensure_ascii=True))

