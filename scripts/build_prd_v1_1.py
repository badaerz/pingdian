from pathlib import Path
import re

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "PRD_v1.1_current.md"
OUTPUT = ROOT / "docs" / "PRD_v1.1_current.docx"
LOGO = ROOT / "public" / "brand" / "story-forge-full-logo-20260820.png"
MARK = ROOT / "public" / "brand" / "story-forge-mark-dark.png"

INK = RGBColor(16, 21, 18)
GREEN = RGBColor(23, 60, 52)
GOLD = RGBColor(166, 116, 36)
MUTED = RGBColor(99, 99, 92)
PAPER = "F6F3EC"
GOLD_FILL = "F4ECD9"
GREEN_FILL = "E6EEE9"
BLUE_FILL = "E9EDF3"


def set_run_font(run, name="Aptos", size=10.5, color=INK, bold=False, italic=False):
    run.font.name = name
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), name)
    run.font.size = Pt(size)
    run.font.color.rgb = color
    run.bold = bold
    run.italic = italic


def shade(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def cell_margins(cell, top=90, start=120, bottom=90, end=120):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for tag, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{tag}"))
        if node is None:
            node = OxmlElement(f"w:{tag}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_table_geometry(table, widths):
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    table.autofit = False
    tbl = table._tbl
    tbl_pr = tbl.tblPr
    tbl_w = tbl_pr.find(qn("w:tblW"))
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        tbl_pr.append(tbl_w)
    tbl_w.set(qn("w:w"), str(sum(widths)))
    tbl_w.set(qn("w:type"), "dxa")
    tbl_ind = tbl_pr.find(qn("w:tblInd"))
    if tbl_ind is None:
        tbl_ind = OxmlElement("w:tblInd")
        tbl_pr.append(tbl_ind)
    tbl_ind.set(qn("w:w"), "120")
    tbl_ind.set(qn("w:type"), "dxa")
    grid = tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in widths:
        col = OxmlElement("w:gridCol")
        col.set(qn("w:w"), str(width))
        grid.append(col)
    for row in table.rows:
        for index, cell in enumerate(row.cells):
            cell.width = Inches(widths[index] / 1440)
            cell_margins(cell)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            tc_pr = cell._tc.get_or_add_tcPr()
            tc_w = tc_pr.find(qn("w:tcW"))
            if tc_w is None:
                tc_w = OxmlElement("w:tcW")
                tc_pr.append(tc_w)
            tc_w.set(qn("w:w"), str(widths[index]))
            tc_w.set(qn("w:type"), "dxa")


def set_page_number(paragraph):
    run = paragraph.add_run()
    fld_char = OxmlElement("w:fldChar")
    fld_char.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = "PAGE"
    fld_char_end = OxmlElement("w:fldChar")
    fld_char_end.set(qn("w:fldCharType"), "end")
    run._r.append(fld_char)
    run._r.append(instr)
    run._r.append(fld_char_end)


def configure_styles(document):
    section = document.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(0.82)
    section.bottom_margin = Inches(0.78)
    section.left_margin = Inches(0.9)
    section.right_margin = Inches(0.9)
    section.header_distance = Inches(0.35)
    section.footer_distance = Inches(0.35)

    normal = document.styles["Normal"]
    normal.font.name = "Aptos"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Aptos")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Aptos")
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = INK
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.12

    for name, size, color, before, after in (
        ("Heading 1", 17, GREEN, 16, 8),
        ("Heading 2", 13, INK, 12, 6),
        ("Heading 3", 11.5, GOLD, 9, 4),
    ):
        style = document.styles[name]
        style.font.name = "Aptos Display"
        style._element.rPr.rFonts.set(qn("w:ascii"), "Aptos Display")
        style._element.rPr.rFonts.set(qn("w:hAnsi"), "Aptos Display")
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = color
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True

    for style_name in ("List Bullet", "List Number"):
        style = document.styles[style_name]
        style.font.name = "Aptos"
        style._element.rPr.rFonts.set(qn("w:ascii"), "Aptos")
        style._element.rPr.rFonts.set(qn("w:hAnsi"), "Aptos")
        style.font.size = Pt(10.5)
        style.paragraph_format.left_indent = Inches(0.28)
        style.paragraph_format.first_line_indent = Inches(-0.18)
        style.paragraph_format.space_after = Pt(4)


def add_header_footer(document):
    section = document.sections[0]
    header = section.header
    hp = header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    if MARK.exists():
        hp.add_run().add_picture(str(MARK), width=Inches(0.22))
    run = hp.add_run("  STORY FORGE  /  PRD v1.1")
    set_run_font(run, size=8.5, color=MUTED, bold=True)
    footer = section.footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = fp.add_run("当前实现版  ·  ")
    set_run_font(run, size=8.5, color=MUTED)
    set_page_number(fp)


def add_cover(document):
    p = document.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(42)
    if LOGO.exists():
        p.add_run().add_picture(str(LOGO), width=Inches(1.65))
    p = document.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(16)
    run = p.add_run("故事熔炉")
    set_run_font(run, name="Aptos Display", size=27, color=INK, bold=True)
    p = document.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("STORY FORGE  /  产品需求文档 v1.1")
    set_run_font(run, size=11, color=GOLD, bold=True)
    p = document.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(18)
    p.paragraph_format.space_after = Pt(72)
    run = p.add_run("当前产品现状 · Demo 验收 · 后续路线")
    set_run_font(run, size=13, color=MUTED)

    table = document.add_table(rows=3, cols=2)
    set_table_geometry(table, [1800, 7560])
    rows = [("定位", "AI 辅助创作 + 数字人文分析 + 过程性写作训练"), ("更新", "2026-08-21"), ("视觉", "纸白 / 深墨 / 森林绿 / 铜金 / 证据靛蓝")]
    for row, (label, value) in zip(table.rows, rows):
        shade(row.cells[0], GREEN_FILL)
        for cell, text in zip(row.cells, (label, value)):
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            run = p.add_run(text)
            set_run_font(run, size=10, color=GREEN if cell is row.cells[0] else INK, bold=cell is row.cells[0])
    document.add_page_break()


def parse_markdown(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    blocks = []
    index = 0
    while index < len(lines):
        line = lines[index]
        if not line.strip():
            index += 1
            continue
        if line.startswith("```"):
            code = []
            index += 1
            while index < len(lines) and not lines[index].startswith("```"):
                code.append(lines[index])
                index += 1
            blocks.append(("code", "\n".join(code)))
            index += 1
            continue
        if line.startswith("|"):
            table = []
            while index < len(lines) and lines[index].startswith("|"):
                cells = [cell.strip() for cell in lines[index].strip().strip("|").split("|")]
                if not all(re.fullmatch(r"[-: ]+", cell or "-") for cell in cells):
                    table.append(cells)
                index += 1
            if table:
                blocks.append(("table", table))
            continue
        if re.match(r"^#{1,3} ", line):
            level = len(line) - len(line.lstrip("#"))
            blocks.append((f"h{level}", line[level + 1:].strip()))
        elif re.match(r"^[-*] ", line):
            blocks.append(("bullet", line[2:].strip()))
        elif re.match(r"^\d+\. ", line):
            blocks.append(("number", re.sub(r"^\d+\. ", "", line).strip()))
        else:
            blocks.append(("p", line.strip()))
        index += 1
    return blocks


def add_table(document, rows):
    cols = max(len(row) for row in rows)
    if cols == 2:
        widths = [1900, 7460]
    elif cols == 4:
        widths = [900, 1900, 3000, 3560]
    else:
        widths = [9360 // cols] * cols
        widths[-1] += 9360 - sum(widths)
    table = document.add_table(rows=len(rows), cols=cols)
    set_table_geometry(table, widths)
    for row_index, row_data in enumerate(rows):
        for col_index in range(cols):
            cell = table.rows[row_index].cells[col_index]
            text = row_data[col_index] if col_index < len(row_data) else ""
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            run = p.add_run(text)
            set_run_font(run, size=8.4 if cols >= 4 else 9, color=INK, bold=row_index == 0)
            if row_index == 0:
                shade(cell, GREEN_FILL)
            elif row_index % 2 == 0:
                shade(cell, "FBFAF7")
    document.add_paragraph().paragraph_format.space_after = Pt(2)


def add_body(document):
    for kind, value in parse_markdown(SOURCE):
        if kind == "h1":
            document.add_heading(value, level=1)
        elif kind == "h2":
            document.add_heading(value, level=2)
        elif kind == "h3":
            document.add_heading(value, level=3)
        elif kind == "table":
            add_table(document, value)
        elif kind in ("bullet", "number"):
            style = "List Bullet" if kind == "bullet" else "List Number"
            p = document.add_paragraph(style=style)
            p.add_run(value)
        elif kind == "code":
            p = document.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.18)
            p.paragraph_format.right_indent = Inches(0.18)
            p.paragraph_format.space_before = Pt(4)
            p.paragraph_format.space_after = Pt(8)
            for index, line in enumerate(value.splitlines()):
                run = p.add_run(line + ("\n" if index < len(value.splitlines()) - 1 else ""))
                set_run_font(run, name="Cascadia Mono", size=8.5, color=GREEN)
        else:
            p = document.add_paragraph()
            p.paragraph_format.space_after = Pt(6)
            p.add_run(value)


def main():
    document = Document()
    configure_styles(document)
    add_header_footer(document)
    add_cover(document)
    add_body(document)
    document.core_properties.title = "故事熔炉 Story Forge 产品需求文档 v1.1"
    document.core_properties.subject = "当前实现版 PRD"
    document.core_properties.author = "Story Forge"
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
