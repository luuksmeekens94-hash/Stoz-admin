from __future__ import annotations

import argparse
import json
from collections import defaultdict
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from typing import Any, cast

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt
from openpyxl import load_workbook
from openpyxl.cell.cell import Cell
from openpyxl.styles import Alignment, Font
from docx.enum.text import WD_ALIGN_PARAGRAPH

ROOT = Path(__file__).resolve().parents[1]
DOCX_TEMPLATE = ROOT / "documents/rvo-templates/Model-D-Voortgangsverslag-STOZ.docx"
XLSX_TEMPLATE = ROOT / "documents/rvo-templates/Format-voortgangsverslag-B-STOZ-2025-D2.0.xlsx"
PRIVATE_CONFIG = ROOT / "documents/concepten/report-config.private.json"


def round2(value: float) -> float:
    return round(value + 1e-12, 2)


def nl_number(value: float) -> str:
    return f"{value:,.2f}".rstrip("0").rstrip(".").replace(",", "X").replace(".", ",").replace("X", ".")


def nl_money(value: float) -> str:
    return f"{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def sum_hours(entries: list[dict[str, Any]]) -> float:
    return round2(sum(float(entry["hours"]) for entry in entries))


def set_repeat_table_header(row: Any) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_cell_text(cell: Any, text: str, bold: bool = False, size: int = 9) -> None:
    cell.text = ""
    paragraph = cell.paragraphs[0]
    paragraph.paragraph_format.space_after = Pt(0)
    run = paragraph.add_run(text)
    run.bold = bold
    run.font.size = Pt(size)
    run.font.name = "Arial"


def approved_cutoff_entries(data: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        entry
        for entry in data["entries"]
        if entry["status"] == "APPROVED" and entry["withinCutoff"]
    ]


def hours_by(entries: list[dict[str, Any]], key: str) -> dict[str, float]:
    values: dict[str, float] = defaultdict(float)
    for entry in entries:
        values[str(entry[key])] += float(entry["hours"])
    return {name: round2(value) for name, value in values.items()}


def parse_report_date(value: str) -> datetime:
    for pattern in ("%d-%m-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, pattern)
        except ValueError:
            continue
    raise ValueError(f"Ongeldige rapportagedatum: {value}")


def activity_status(
    actual_hours: float,
    start: str,
    end: str,
    cutoff: str,
    latest_actual_date: str | None,
) -> str:
    start_date = parse_report_date(start)
    end_date = parse_report_date(end)
    cutoff_date = parse_report_date(cutoff)
    if actual_hours > 0:
        if end_date < cutoff_date:
            if latest_actual_date and parse_report_date(latest_actual_date) > end_date:
                return "Uitgevoerd / doorlopend na planfase"
            return "Uitgevoerd"
        return "In uitvoering"
    if start_date > cutoff_date:
        return "Nog niet gestart"
    return "Nog niet afzonderlijk geregistreerd"


def build_model_d(data: dict[str, Any], output: Path) -> None:
    entries = approved_cutoff_entries(data)
    by_wp = hours_by(entries, "workPackage")
    by_activity = hours_by(entries, "activity")
    approved_hours = sum_hours(entries)
    attendees = sum(len(training["presentAttendees"]) for training in data["trainings"])
    training_hours = sum(
        len(training["presentAttendees"]) * float(training["hours"])
        for training in data["trainings"]
    )
    clients = int(data["counts"]["clients"])
    surveys = int(data["counts"]["surveyResponses"])
    planning = data.get("planningVersion")
    forecast_count = sum(len(allocation["details"]) for allocation in planning["allocations"]) if planning else 0

    doc = Document(str(DOCX_TEMPLATE))
    doc.core_properties.title = "Concept voortgangsverslag STOZ – Hybride Begrip"
    doc.core_properties.subject = "RVO Model D – STOZ25-03851282"
    doc.core_properties.author = "Fysiotherapie Fy-fit"
    doc.core_properties.comments = f"Concept op basis van de projectadministratie met peildatum {data['asOf']}."

    doc.paragraphs[6].text = "☐ Ja     ☒ Nee"
    doc.paragraphs[9].text = "☒ Ja     ☐ Nee"
    doc.paragraphs[16].text = "☐ Ja     ☒ Nee"
    doc.paragraphs[20].text = "☐ Ja     ☒ Nee"

    concept = doc.paragraphs[2].insert_paragraph_before(
        "CONCEPTVERSIE – peildatum 31 augustus 2026 – gereed voor eindcontrole, nog niet indienen"
    )
    for run in concept.runs:
        run.bold = True
        run.font.name = "Arial"
        run.font.size = Pt(10)

    responses = [
        "1 september 2025 tot en met 31 augustus 2026. De feitelijke projectuitvoering is in maart 2026 gestart.",
        f"De werkzaamheden zijn niet volledig volgens de oorspronkelijke tijdslijn uitgevoerd. De feitelijke uitvoering startte in maart 2026. Sindsdien zijn projectmanagement, inhoudsontwikkeling, digitale productie, praktijktraining, kennisdeling en monitoring uitgevoerd. De resterende implementatie-, borgings- en evaluatieactiviteiten zijn operationeel gepland in {forecast_count} afzonderlijke forecastregels tot en met augustus 2027. De formele projecteinddatum blijft 1 september 2027.",
        "De latere feitelijke start heeft geleid tot minder afgeronde cliënttrajecten en uitkomstmetingen dan oorspronkelijk beoogd. Daardoor zijn cliëntimpact en medewerkerervaring in deze verslagperiode nog niet kwantitatief te onderbouwen. De urenrealisatie is daarnaast ongelijk over de werkpakketten verdeeld: contentontwikkeling is sterk voorbelast, terwijl implementatie en uitkomstmeting later op gang komen. Dit heeft op de peildatum geen verhoging van het verleende subsidiebedrag tot gevolg.",
        "In de verslagperiode zijn geen afzonderlijke externe ontwikkelingen of organisatorische veranderingen geregistreerd die, naast de latere feitelijke start, aantoonbaar van invloed zijn op de projectuitvoering.",
        "De inhoudelijke en financiële administratie is gereconcilieerd met de ingediende begroting, de RVO-verleningsbeschikking, goedgekeurde uren, gekoppelde facturen en de presentielijst. De beschikking gaat voor waar RVO bedragen heeft aangepast. Alleen cutoff-geschikte en herleidbare realisatie is in de verslagen opgenomen.",
        "Op dit moment wordt geen contactverzoek aan een RVO-adviseur opgenomen. Indien Fy-fit voorafgaand aan indiening nog afstemming wenst over begrotingsafwijkingen, kan dit antwoord worden aangepast.",
        "Er is een digitale meertalige informatievoorziening rond zorgpaden gerealiseerd, met digitale patiëntinformatie en video’s als voorbereiding op en ondersteuning van het behandeltraject. Inhoud, taalniveau en vindbaarheid worden stapsgewijs uitgebreid.",
        "Er is geïnventariseerd, vakinhoud is ontwikkeld en vertaald, digitale content en video zijn geproduceerd en de toepassing is technisch ingericht. De opschaling verloopt gefaseerd per zorgpad, zodat inhoud en werkproces tijdens het gebruik kunnen worden aangescherpt.",
        "De digitale informatie wordt gekoppeld aan intake, behandelplan en vervolgmomenten. Patiënten krijgen gerichte informatie vooraf en tijdens het traject; de fysiotherapeut gebruikt dezelfde content in de begeleiding. Volledige borging in alle reguliere werkprocessen is nog in uitvoering.",
        f"Fysiotherapeuten zijn betrokken via een praktijktraining, vakinhoudelijke inhoudsontwikkeling en feedback op toepasbaarheid. De presentielijst bevat {attendees} aanwezige medewerkers; de operationele deelname vertegenwoordigt {nl_number(training_hours)} uur. Verdere ondersteuning vindt plaats tijdens de gefaseerde invoering.",
        f"Patiënten krijgen eenvoudige meertalige informatie en ondersteunende video’s. Op de peildatum zijn {clients} cliëntregistraties met een volledige voor- en nameting beschikbaar. De eerste gebruiks- en uitkomstmetingen volgen bij afgeronde trajecten.",
        f"Tot en met 31 augustus 2026 zijn {nl_number(approved_hours)} goedgekeurde projecturen geregistreerd: WP1 {nl_number(by_wp.get('WP1', 0))} uur, WP2 {nl_number(by_wp.get('WP2', 0))} uur, WP3 {nl_number(by_wp.get('WP3', 0))} uur, WP4 {nl_number(by_wp.get('WP4', 0))} uur, WP5 {nl_number(by_wp.get('WP5', 0))} uur en WP6 {nl_number(by_wp.get('WP6', 0))} uur. Er staan geen concept-, ingediende of toekomstig gedateerde realisatie-uren open.",
        f"Tussenresultaten: {attendees} medewerkers hebben de praktijktraining gevolgd. Het aantal cliënttrajecten met een volledige voor- en nameting is {clients}. Er zijn {surveys} ingevulde fysiotherapeutenvragenlijsten. Deze aantallen worden in de volgende verslagperiode geactualiseerd.",
        "De monitoring combineert cliëntmetingen vóór en na het traject, een meting circa drie maanden na afronding, behandelresultaten en een vragenlijst onder fysiotherapeuten. De registratiebasis is ingericht. Omdat nog geen volledige cliënt- of fysiotherapeutmetingen beschikbaar zijn, worden geen kwantitatieve impactclaims gedaan.",
        "Niet van toepassing: Hybride Begrip valt onder de opschalingsroute en niet onder de evaluatieroute.",
        "Er zijn nog onvoldoende afgeronde trajecten voor een betrouwbare kwantitatieve impactuitspraak. De verwachte bijdrage ligt in beter begrip, betere voorbereiding, consistente informatie en efficiëntere begeleiding. Dit wordt in de volgende verslagperiode getoetst met cliënt- en medewerkergegevens.",
        "Kennisdeling vindt binnen Fy-fit plaats via training, gezamenlijke inhoudsontwikkeling en gebruiksfeedback. De eerste uren onder WP5 zijn geregistreerd. Externe verspreiding van lessen en herbruikbare werkwijzen wordt in de vervolgfase concreet uitgevoerd en met bewijs vastgelegd.",
        "De huidige uitkomsten beschrijven de feitelijke tussenstand en zijn geen eindmeting. Kwantitatieve cliënt- en medewerkeruitkomsten worden pas toegevoegd nadat voldoende volledige trajecten en respons beschikbaar zijn.",
    ]
    if len(doc.tables) < 24:
        raise RuntimeError(f"Onverwacht Model D: {len(doc.tables)} tabellen")
    for index, text in enumerate(responses):
        set_cell_text(doc.tables[index].cell(0, 0), text, size=9)

    activity_names = {row["code"]: row["name"] for row in data["activities"]}
    latest_activity_dates = {
        code: max(entry["date"] for entry in entries if entry["activity"] == code)
        for code in by_activity
    }
    activity_plan = [
        ("A1.1", "01-09-2025", "31-08-2027"), ("A1.2", "01-11-2025", "28-02-2026"),
        ("A2.1", "01-10-2025", "28-02-2026"), ("A2.2", "01-11-2025", "31-03-2026"),
        ("A2.3", "01-03-2026", "31-05-2026"), ("A3.1", "01-12-2025", "31-05-2026"),
        ("A3.2", "01-04-2026", "31-10-2026"), ("A4.1", "01-03-2026", "31-08-2026"),
        ("A4.2", "01-07-2026", "28-02-2027"), ("A5.1", "01-08-2026", "28-02-2027"),
        ("A5.2", "01-03-2027", "31-08-2027"), ("A6.1", "01-03-2026", "31-08-2027"),
        ("A6.2", "01-03-2027", "31-08-2027"),
    ]
    table = doc.tables[18]
    while len(table.rows) < len(activity_plan) + 1:
        new_row = table.add_row()
        template_row = table.rows[-2]
        for index, cell in enumerate(new_row.cells):
            cell._tc.get_or_add_tcPr().append(deepcopy(template_row.cells[index]._tc.get_or_add_tcPr()))
    set_repeat_table_header(table.rows[0])
    for row_index, (code, start, end) in enumerate(activity_plan, start=1):
        actual = by_activity.get(code, 0)
        status = activity_status(actual, start, end, "31-08-2026", latest_activity_dates.get(code))
        if actual > 0:
            detail = f"{nl_number(actual)} goedgekeurde uren geregistreerd; voortgang en afwijkingen zijn in het verslag toegelicht."
        elif status == "Nog niet gestart":
            detail = "Activiteit ligt buiten de huidige feitelijke verslagstand."
        else:
            detail = "Activiteit is operationeel voorbereid of gepland, maar heeft op de cutoff geen afzonderlijke goedgekeurde uren."
        values = [f"{code} · {activity_names.get(code, code)}", detail, start, end, status]
        for cell, value in zip(table.rows[row_index].cells, values):
            set_cell_text(cell, value, size=8)

    collaboration = [
        "De samenwerking met de inkoper is in deze verslagperiode nog beperkt. Er zijn nog geen afzonderlijke contractafspraken over de digitale of hybride werkwijze vastgelegd. Borging met inkopers wordt in de volgende fase concreter uitgewerkt.",
        "Er zijn geen andere formeel deelnemende zorgaanbieders in de financiële projectadministratie opgenomen. Binnen Fy-fit wordt de inzet geleverd door praktijkhouders, praktijkmanager, fysiotherapeuten, front- en backoffice en de externe projectmanager.",
        "Leveranciers ondersteunen technische realisatie, website en digitale content. Leveranciersinzet wordt operationeel in uren zichtbaar gehouden, maar financieel alleen opgenomen wanneer een factuur of betaalbewijs aanwezig en correct gekoppeld is.",
        "De samenwerking met overige betrokken partijen staat in deze fase vooral in het teken van interne implementatie. Regionale samenwerking en bredere kennisdeling worden vanaf WP5 verder opgebouwd.",
        "Afspraken met inkopers, externe partners en leveranciers worden in volgende verslagperioden aangevuld zodra deze in de projectadministratie zijn vastgelegd.",
    ]
    for index, text in enumerate(collaboration, start=19):
        set_cell_text(doc.tables[index].cell(0, 0), text, size=9)

    for section in doc.sections:
        footer = section.footer.paragraphs[0]
        footer.text = "CONCEPT – Hybride Begrip – STOZ25-03851282 – peildatum 31 augustus 2026"
        footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for run in footer.runs:
            run.font.size = Pt(8)
            run.font.name = "Arial"
    doc.save(str(output))


def clear_input_rows(sheet: Any, rows: range, columns: tuple[str, ...]) -> None:
    for row in rows:
        for column in columns:
            sheet[f"{column}{row}"] = None


def build_model_b(data: dict[str, Any], output: Path, private_config_path: Path = PRIVATE_CONFIG) -> None:
    config = json.loads(private_config_path.read_text(encoding="utf-8"))
    internal_names = set(config["internalCostUsers"])
    website_builder_names = set(config.get("websiteBuilderUsers", ["Lodewijk Tromp"]))
    entries = approved_cutoff_entries(data)
    internal = [entry for entry in entries if entry["user"] in internal_names]
    project_entries = [entry for entry in internal if entry["workPackage"] == "WP1"]
    implementation_entries = [entry for entry in internal if entry["workPackage"] not in {"WP1", "WP3"}]
    instructor_entries = [entry for entry in internal if entry["workPackage"] == "WP3" and not entry["therapist"]]

    workbook = load_workbook(XLSX_TEMPLATE, data_only=False)
    workbook.calculation.fullCalcOnLoad = True
    workbook.calculation.forceFullCalc = True
    workbook.calculation.calcMode = "auto"
    cover = workbook["Voorblad"]
    cover["D5"] = "CONCEPT – gereed voor eindcontrole, nog niet indienen"
    cover["D5"].font = Font(name="Arial", size=12, bold=True, color="C00000")
    cover["D6"] = "Peildatum 31 augustus 2026"
    cover["D6"].font = Font(name="Arial", size=10, color="C00000")
    sheet = workbook["Aanvrager-Penvoerder"]
    sheet["C2"] = data["applicant"]
    sheet["C3"] = data["projectName"]
    sheet["F5"] = "Nee"
    sheet["F6"] = "KMO"
    sheet["F7"] = "N.v.t.; intern begrotingstarief € 50 per uur"
    sheet["F8"] = "Opschalingsroute"
    sheet["F9"] = data["approvedSubsidy"]

    input_font = Font(name="Arial", size=10, color="0000FF")
    clear_input_rows(sheet, range(16, 25), ("B", "C", "D", "E"))
    clear_input_rows(sheet, range(52, 61), ("B", "C", "D", "E"))
    clear_input_rows(sheet, range(102, 111), ("B", "C", "D", "E"))
    clear_input_rows(sheet, range(116, 125), ("B", "C", "D", "E"))

    def fill_people(rows: range, source: list[dict[str, Any]], training: bool = False) -> None:
        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for entry in source:
            grouped[entry["user"]].append(entry)
        for row, (name, person_entries) in zip(rows, sorted(grouped.items())):
            if training:
                sheet[f"B{row}"] = "Interne instructie en ondersteuning"
                sheet[f"C{row}"] = name
            else:
                sheet[f"B{row}"] = name
                sheet[f"C{row}"] = "Loondienst"
            sheet[f"D{row}"] = 50
            sheet[f"E{row}"] = sum_hours(person_entries)
            for column in ("B", "C", "D", "E"):
                sheet[f"{column}{row}"].font = input_font

    fill_people(range(16, 25), project_entries)
    fill_people(range(52, 61), implementation_entries)
    fill_people(range(116, 125), instructor_entries, training=True)

    confirmed = [
        invoice for invoice in data["invoices"]
        if invoice["confirmedBudgetLineId"] == "external-project-manager"
        and invoice["vatTreatment"] == "INCLUDED_CONFIRMED"
        and invoice["hasEvidence"]
    ]
    invoice_ex = round2(sum(float(row["amountExVat"]) for row in confirmed))
    invoice_vat = round2(sum(float(row["vatAmount"]) for row in confirmed))
    sheet["B68"] = "LS Project- en innovatiemanagement · facturen 66, 67 en 71"
    sheet["D68"] = 100
    sheet["E68"] = round2(invoice_ex / 100)
    sheet["B75"] = "Niet-verrekenbare btw op bevestigde facturen 66, 67 en 71"
    sheet["F75"] = invoice_vat

    website_entries = [
        entry for entry in entries
        if entry["user"] in website_builder_names and entry["workPackage"] == "WP2"
    ]
    website_hours = sum_hours(website_entries)
    website_ex_vat = round2(website_hours * 100)
    website_vat = round2(website_ex_vat * 0.21)
    sheet["B69"] = "Websitebouwer · projecturen Hybride Begrip (projecteigenaar bevestigd)"
    sheet["D69"] = 100
    sheet["E69"] = website_hours
    sheet["B76"] = "Niet-verrekenbare btw websitebouwer · voorlopig 21%"
    sheet["F76"] = website_vat

    sheet["B87"] = "Synthesia Creator · 12 maanden × €49"
    sheet["C87"] = "Aankoop"
    sheet["D87"] = 12
    sheet["E87"] = 49
    sheet["B88"] = "ChatGPT Plus · 12 maanden × €22 (omrekening van $24,20 per maand)"
    sheet["C88"] = "Aankoop"
    sheet["D88"] = 12
    sheet["E88"] = 22

    sheet["B139"] = "Communicatietraining omgaan met beperkte basisvaardigheden"
    sheet["F139"] = 645

    # Verleende bedragen: ingediende Model B, gecorrigeerd conform RVO-beschikking.
    approved_cells = {
        "I16": 16250, "I52": 7250, "I53": 3000, "I54": 1000,
        "I68": 32500, "I69": 2500, "I87": 8000, "I88": 2400,
        "I116": 1000, "I139": 645,
    }
    for coordinate, value in approved_cells.items():
        sheet[coordinate] = value

    notes = [
        "CONCEPT – peildatum 31 augustus 2026. Gereed voor eindcontrole; nog niet indienen.",
        "De kolom Verleend volgt ongewijzigd de ingediende begroting en RVO-beschikking STOZ25-03851282. In de oorspronkelijke begroting zijn de externe kosten exclusief btw opgenomen en is geen afzonderlijk btw-bedrag begroot; daarom blijft de verleende kolom bij de beschikking aansluiten.",
        "De oorspronkelijke begroting vermeldt bij btw-plichtigheid ‘Nee’ en noemt het tarief van de externe project- en innovatiemanager expliciet exclusief btw. Fy-fit kan deze btw niet verrekenen. De werkelijk verschuldigde niet-verrekenbare btw is daarom als subsidiabele projectrealisatie afzonderlijk opgenomen onder Kosten derden – overig, zonder dubbeltelling met de bedragen exclusief btw.",
        f"Externe projectmanagementkosten zijn gebaseerd op facturen 66, 67 en 71: € {nl_money(invoice_ex)} exclusief btw en € {nl_money(invoice_vat)} btw.",
        f"Websitebouwer: {nl_number(website_hours)} bevestigde projecturen × €100 = € {nl_money(website_ex_vat)} exclusief btw; voorlopig 21% niet-verrekenbare btw = € {nl_money(website_vat)}. Onderliggende maandfacturen worden intern gereconcilieerd.",
        "Synthesia Creator is voorlopig opgenomen als 12 × €49 = €588. ChatGPT Plus is voorlopig opgenomen als 12 × €22 = €264, gebaseerd op $24,20 per maand en de door de projecteigenaar genoemde euro-afschrijving.",
        "De communicatietraining is voor €645 opgenomen overeenkomstig de gereconcilieerde begrotingsregel en de bevestiging dat de factuur aanwezig is. Het bedrag wordt als totale subsidiabele kostenpost behandeld; er wordt geen extra btw bovenop gezet.",
        "De verleende begroting hanteert €50 per uur voor praktijkmanagement, praktijkhouders en fysiotherapeuten; voor de 68 subsidiabele fysiotherapeuturen in deze verslagperiode is die verleende begrotingsbasis aangehouden. Omdat fysiotherapeuten een individuele arbeidsovereenkomst en loonstrook hebben, worden hun definitieve werkelijke uurtarieven vóór de eindafrekening per persoon gereconcilieerd volgens de RVO-methode voor werkelijke loonkosten. Een generiek tarief van €35 wordt niet zonder onderliggende individuele berekening toegepast. De 28 uur scholingsdeelname van fysiotherapeuten blijft operationeel buiten Model B; alleen 20 uur interne opleidersinzet is onder Opleiding opgenomen.",
        "De conceptrealisatie bedraagt €38.703,00. De abonnementen en websitekosten zijn op projecteigenaarbevestiging berekend en worden na ontvangst van alle facturen intern op exacte euro- en btw-bedragen gereconcilieerd; de facturen hoeven niet als bijlage bij Model B te worden ingediend.",
    ]
    for row, line in enumerate(notes, start=161):
        cell = cast(Cell, sheet.cell(row=row, column=2))
        cell.value = line
        cell.number_format = "@"
        cell.alignment = Alignment(wrap_text=True, vertical="top", horizontal="left")
        cell.font = Font(name="Arial", size=9, color="0000FF")
        sheet.merge_cells(start_row=row, start_column=2, end_row=row, end_column=6)
        sheet.row_dimensions[row].height = 90 if len(line) > 400 else 42 if len(line) >= 140 else 30

    for worksheet in workbook.worksheets:
        worksheet.sheet_view.showGridLines = False
    for index in range(1, 8):
        participant = workbook[f"Deelnemer{index}"]
        participant.sheet_state = "hidden"
        for coordinate in ("J43", "J77", "J91", "J138", "J140"):
            formula = participant[coordinate].value
            if isinstance(formula, str) and formula.startswith("=") and not formula.startswith("=IFERROR("):
                participant[coordinate] = f"=IFERROR({formula[1:]},0)"
    workbook.save(output)


def build_reports(
    snapshot_path: Path,
    output_dir: Path,
    private_config_path: Path = PRIVATE_CONFIG,
) -> dict[str, Path]:
    data = json.loads(snapshot_path.read_text(encoding="utf-8"))
    if data.get("asOf") != "2026-08-31":
        raise ValueError("De rapportagesnapshot moet exact peildatum 2026-08-31 hebben.")
    entries = approved_cutoff_entries(data)
    if len(entries) != len(data["entries"]):
        raise ValueError("De snapshot bevat open of toekomstige uren; sluit die eerst af.")
    output_dir.mkdir(parents=True, exist_ok=True)
    docx = output_dir / "CONCEPT-Model-D-Voortgangsverslag-Hybride-Begrip-2026-08-31.docx"
    xlsx = output_dir / "CONCEPT-Model-B-Financieel-Voortgangsverslag-Hybride-Begrip-2026-08-31.xlsx"
    build_model_d(data, docx)
    build_model_b(data, xlsx, private_config_path)
    return {"docx": docx, "xlsx": xlsx}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    outputs = build_reports(args.snapshot, args.output_dir)
    print(json.dumps({key: str(value) for key, value in outputs.items()}, indent=2))


if __name__ == "__main__":
    main()
