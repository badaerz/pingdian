from __future__ import annotations

import re
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION_START
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
LOGO = ROOT / "public" / "brand" / "story-forge-logo.png"

INK = "101512"
FOREST = "173C34"
PAPER = "F4F0E8"
COPPER = "D3A456"
INDIGO = "7184A5"
MUTED = "5C665F"
LINE = "D7D0C4"


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=80, start=120, bottom=80, end=120) -> None:
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_cell_border(cell, color=LINE, size="6") -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.first_child_found_in("w:tcBorders")
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = f"w:{edge}"
        element = borders.find(qn(tag))
        if element is None:
            element = OxmlElement(tag)
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), size)
        element.set(qn("w:space"), "0")
        element.set(qn("w:color"), color)


def set_table_geometry(table, widths) -> None:
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    table.autofit = False
    for row in table.rows:
        for idx, cell in enumerate(row.cells):
            width = widths[idx]
            cell.width = Inches(width)
            tc_pr = cell._tc.get_or_add_tcPr()
            tc_w = tc_pr.find(qn("w:tcW"))
            if tc_w is None:
                tc_w = OxmlElement("w:tcW")
                tc_pr.append(tc_w)
            tc_w.set(qn("w:w"), str(int(width * 1440)))
            tc_w.set(qn("w:type"), "dxa")
            set_cell_margins(cell)
            set_cell_border(cell)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    tbl_pr = table._tbl.tblPr
    tbl_w = tbl_pr.find(qn("w:tblW"))
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        tbl_pr.append(tbl_w)
    tbl_w.set(qn("w:w"), str(int(sum(widths) * 1440)))
    tbl_w.set(qn("w:type"), "dxa")
    tbl_ind = tbl_pr.find(qn("w:tblInd"))
    if tbl_ind is None:
        tbl_ind = OxmlElement("w:tblInd")
        tbl_pr.append(tbl_ind)
    tbl_ind.set(qn("w:w"), "120")
    tbl_ind.set(qn("w:type"), "dxa")


def repeat_table_header(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    header = tr_pr.find(qn("w:tblHeader"))
    if header is None:
        header = OxmlElement("w:tblHeader")
        tr_pr.append(header)
    header.set(qn("w:val"), "true")


def new_number_id(doc: Document) -> int:
    numbering = doc.part.numbering_part.element
    abstract_ids = [int(node.get(qn("w:abstractNumId"))) for node in numbering.findall(qn("w:abstractNum"))]
    num_ids = [int(node.get(qn("w:numId"))) for node in numbering.findall(qn("w:num"))]
    abstract_id = max(abstract_ids or [0]) + 1
    num_id = max(num_ids or [0]) + 1
    abstract = OxmlElement("w:abstractNum")
    abstract.set(qn("w:abstractNumId"), str(abstract_id))
    multi = OxmlElement("w:multiLevelType")
    multi.set(qn("w:val"), "singleLevel")
    abstract.append(multi)
    level = OxmlElement("w:lvl")
    level.set(qn("w:ilvl"), "0")
    start = OxmlElement("w:start")
    start.set(qn("w:val"), "1")
    fmt = OxmlElement("w:numFmt")
    fmt.set(qn("w:val"), "decimal")
    text = OxmlElement("w:lvlText")
    text.set(qn("w:val"), "%1.")
    jc = OxmlElement("w:lvlJc")
    jc.set(qn("w:val"), "left")
    p_pr = OxmlElement("w:pPr")
    ind = OxmlElement("w:ind")
    ind.set(qn("w:left"), "540")
    ind.set(qn("w:hanging"), "270")
    p_pr.append(ind)
    for node in (start, fmt, text, jc, p_pr):
        level.append(node)
    abstract.append(level)
    numbering.append(abstract)
    num = OxmlElement("w:num")
    num.set(qn("w:numId"), str(num_id))
    abstract_ref = OxmlElement("w:abstractNumId")
    abstract_ref.set(qn("w:val"), str(abstract_id))
    num.append(abstract_ref)
    numbering.append(num)
    return num_id


def apply_numbering(paragraph, num_id: int) -> None:
    p_pr = paragraph._p.get_or_add_pPr()
    num_pr = OxmlElement("w:numPr")
    ilvl = OxmlElement("w:ilvl")
    ilvl.set(qn("w:val"), "0")
    num_id_node = OxmlElement("w:numId")
    num_id_node.set(qn("w:val"), str(num_id))
    num_pr.append(ilvl)
    num_pr.append(num_id_node)
    p_pr.append(num_pr)


def set_font(run, name="Calibri", size=11, color=INK, bold=False, italic=False):
    run.font.name = name
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
    run.font.size = Pt(size)
    run.font.color.rgb = RGBColor.from_string(color)
    run.bold = bold
    run.italic = italic


def configure_document(doc: Document, compact: bool) -> None:
    section = doc.sections[0]
    section.top_margin = Inches(0.78 if compact else 0.9)
    section.bottom_margin = Inches(0.72 if compact else 0.82)
    section.left_margin = Inches(0.82)
    section.right_margin = Inches(0.82)
    section.header_distance = Inches(0.35)
    section.footer_distance = Inches(0.35)
    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Calibri"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
    normal.font.size = Pt(10.3 if compact else 10.8)
    normal.font.color.rgb = RGBColor.from_string(INK)
    normal.paragraph_format.space_after = Pt(5 if compact else 6)
    normal.paragraph_format.line_spacing = 1.17 if compact else 1.1
    for style_name, size, color, before, after in (
        ("Heading 1", 16, FOREST, 15 if compact else 16, 8),
        ("Heading 2", 13, FOREST, 11 if compact else 12, 6),
        ("Heading 3", 11.5, INDIGO, 8 if compact else 9, 4),
    ):
        style = styles[style_name]
        style.font.name = "Calibri"
        style._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
        style._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor.from_string(color)
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True
    for style_name in ("List Bullet", "List Number"):
        style = styles[style_name]
        style.font.name = "Calibri"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
        style.font.size = Pt(10.3 if compact else 10.8)
        style.paragraph_format.left_indent = Inches(0.28)
        style.paragraph_format.first_line_indent = Inches(-0.18)
        style.paragraph_format.space_after = Pt(3 if compact else 4)
        style.paragraph_format.line_spacing = 1.17
    header = section.header
    hp = header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    hr = hp.add_run("STORY FORGE  /  故事熔炉")
    set_font(hr, size=8.5, color=MUTED, bold=True)
    footer = section.footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fr = fp.add_run("Story Forge · 当前实现文档 · 2026-08-22")
    set_font(fr, size=8.5, color=MUTED)


def add_title_block(doc: Document, title: str, subtitle: str, compact: bool) -> None:
    if LOGO.exists():
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_after = Pt(4)
        p.add_run().add_picture(str(LOGO), width=Inches(1.25))
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run(title)
    set_font(r, size=22 if not compact else 21, color=INK, bold=True)
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(10)
    r = p.add_run(subtitle)
    set_font(r, size=11.5, color=FOREST, bold=True)
    meta = doc.add_table(rows=1, cols=3)
    set_table_geometry(meta, [2.1, 2.1, 2.1])
    values = ["当前发布候选  v0.1.0-rc.1", "固化提交  af14bc7", "更新时间  2026-08-22"]
    for cell, value in zip(meta.rows[0].cells, values):
        set_cell_shading(cell, PAPER)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(value)
        set_font(r, size=8.6, color=FOREST, bold=True)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def add_markdown_inline(paragraph, text):
    pattern = re.compile(r"(\*\*[^*]+\*\*|`[^`]+`)")
    cursor = 0
    for match in pattern.finditer(text):
        if match.start() > cursor:
            r = paragraph.add_run(text[cursor:match.start()])
            set_font(r)
        token = match.group(0)
        if token.startswith("**"):
            r = paragraph.add_run(token[2:-2])
            set_font(r, bold=True, color=FOREST)
        else:
            r = paragraph.add_run(token[1:-1])
            set_font(r, name="Consolas", size=9.5, color=INDIGO)
        cursor = match.end()
    if cursor < len(text):
        r = paragraph.add_run(text[cursor:])
        set_font(r)


def add_table(doc, rows, compact):
    if not rows:
        return
    cols = len(rows[0])
    widths = [6.12 / cols] * cols
    if cols == 2:
        widths = [1.25, 4.87] if compact else [1.42, 4.70]
    elif cols == 3:
        widths = [1.35, 2.25, 2.57]
    elif cols == 4:
        widths = [0.62, 1.32, 2.55, 1.68]
    elif cols == 5:
        widths = [0.48, 1.02, 2.08, 0.72, 1.82]
    table = doc.add_table(rows=len(rows), cols=cols)
    set_table_geometry(table, widths)
    repeat_table_header(table.rows[0])
    for ridx, row in enumerate(rows):
        for cidx, value in enumerate(row):
            cell = table.rows[ridx].cells[cidx]
            if ridx == 0:
                set_cell_shading(cell, FOREST)
            elif ridx % 2 == 0:
                set_cell_shading(cell, "FAF8F2")
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.05
            r = p.add_run(value)
            set_font(r, size=8.0 if cols >= 4 else 8.5, color="FFFFFF" if ridx == 0 else INK, bold=ridx == 0)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)


def add_code_block(doc, lines):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.18)
    p.paragraph_format.right_indent = Inches(0.08)
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.0
    for idx, line in enumerate(lines):
        if idx:
            p.add_run().add_break()
        r = p.add_run(line)
        set_font(r, name="Consolas", size=8.3, color=INDIGO)
    p_pr = p._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), "F0F3F1")
    p_pr.append(shd)


def parse_markdown(path: Path):
    lines = path.read_text(encoding="utf-8").splitlines()
    blocks = []
    idx = 0
    while idx < len(lines):
        line = lines[idx]
        if not line.strip():
            idx += 1
            continue
        if line.startswith("```"):
            code = []
            idx += 1
            while idx < len(lines) and not lines[idx].startswith("```"):
                code.append(lines[idx])
                idx += 1
            idx += 1
            blocks.append(("code", code))
            continue
        if line.startswith("|"):
            table = []
            while idx < len(lines) and lines[idx].startswith("|"):
                cells = [c.strip() for c in lines[idx].strip().strip("|").split("|")]
                if not all(re.fullmatch(r"[-: ]+", c or " ") for c in cells):
                    table.append(cells)
                idx += 1
            blocks.append(("table", table))
            continue
        m = re.match(r"^(#{1,3})\s+(.*)$", line)
        if m:
            blocks.append(("heading", (len(m.group(1)), m.group(2))))
        elif re.match(r"^[-*]\s+", line):
            blocks.append(("bullet", re.sub(r"^[-*]\s+", "", line)))
        elif re.match(r"^\d+\.\s+", line):
            blocks.append(("number", re.sub(r"^\d+\.\s+", "", line)))
        else:
            blocks.append(("para", line))
        idx += 1
    return blocks


def build_doc(markdown: Path, output: Path, compact: bool, title: str, subtitle: str):
    doc = Document()
    configure_document(doc, compact)
    add_title_block(doc, title, subtitle, compact)
    blocks = parse_markdown(markdown)
    first_heading = True
    active_num_id = None
    for kind, value in blocks:
        if kind == "heading":
            active_num_id = None
            level, text = value
            if first_heading and level == 1:
                first_heading = False
                continue
            p = doc.add_paragraph(style=f"Heading {min(level, 3)}")
            add_markdown_inline(p, text)
        elif kind == "bullet":
            active_num_id = None
            p = doc.add_paragraph(style="List Bullet")
            add_markdown_inline(p, value)
        elif kind == "number":
            if active_num_id is None:
                active_num_id = new_number_id(doc)
            p = doc.add_paragraph()
            apply_numbering(p, active_num_id)
            add_markdown_inline(p, value)
        elif kind == "table":
            active_num_id = None
            add_table(doc, value, compact)
        elif kind == "code":
            active_num_id = None
            add_code_block(doc, value)
        else:
            active_num_id = None
            p = doc.add_paragraph()
            add_markdown_inline(p, value)
    output.parent.mkdir(parents=True, exist_ok=True)
    doc.save(output)


if __name__ == "__main__":
    build_doc(
        DOCS / "PRD_v1.2_current.md",
        DOCS / "PRD_v1.2_current.docx",
        compact=False,
        title="故事熔炉 Story Forge",
        subtitle="产品需求文档 v1.2 · 当前实现与答辩版",
    )
    build_doc(
        DOCS / "Story_Forge技术功能说明书.md",
        DOCS / "Story_Forge技术功能说明书.docx",
        compact=True,
        title="Story Forge 故事熔炉",
        subtitle="网站功能与技术说明书 · 面向文科生与产品经理",
    )
