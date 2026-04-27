import os
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO

from django.conf import settings
from django.http import FileResponse
from django.utils import timezone
from django.utils.timezone import localtime

from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from trips.models import Trip
from .models import Expense
from .services import compute_balance


def _to_decimal(value) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def _q2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _fmt_dt(value) -> str:
    if not value:
        return "—"
    return localtime(value).strftime("%Y-%m-%d %H:%M")


def _fmt_money(value) -> str:
    return str(_q2(_to_decimal(value)))


def _short(value, limit: int) -> str:
    text = str(value or "")
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def _register_fonts():
    fonts_dir = os.path.join(settings.BASE_DIR, "assets", "fonts")
    fonts = {
        "DejaVuSans": "DejaVuSans.ttf",
        "DejaVuSans-Bold": "DejaVuSans-Bold.ttf",
        "DejaVuSans-Oblique": "DejaVuSans-Oblique.ttf",
    }
    registered = set(pdfmetrics.getRegisteredFontNames())
    for name, filename in fonts.items():
        if name in registered:
            continue
        pdfmetrics.registerFont(TTFont(name, os.path.join(fonts_dir, filename)))


def _build_styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title",
            parent=base["Heading1"],
            fontName="DejaVuSans-Bold",
            fontSize=18,
            leading=22,
            spaceAfter=4,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Heading2"],
            fontName="DejaVuSans-Bold",
            fontSize=13,
            leading=16,
            spaceBefore=8,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["BodyText"],
            fontName="DejaVuSans",
            fontSize=9.5,
            leading=12,
        ),
        "meta": ParagraphStyle(
            "meta",
            parent=base["BodyText"],
            fontName="DejaVuSans-Oblique",
            fontSize=9,
            textColor=colors.HexColor("#475569"),
        ),
    }


def _build_table(data, col_widths):
    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), "DejaVuSans-Bold"),
                ("FONTNAME", (0, 1), (-1, -1), "DejaVuSans"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return table


def _build_horizontal_bar_chart(title: str, rows, width: float, height: float, bar_color):
    prepared = [(str(label), _to_decimal(value)) for label, value in rows if _to_decimal(value) > 0]
    if not prepared:
        return None
    prepared.sort(key=lambda x: x[1], reverse=True)
    prepared = prepared[:8]

    drawing = Drawing(width, height)
    drawing.add(String(0, height - 14, title, fontName="DejaVuSans-Bold", fontSize=10.5, fillColor=colors.HexColor("#0f172a")))

    top = height - 24
    bottom = 8
    plot_height = max(20, top - bottom)
    row_height = plot_height / len(prepared)

    label_width = min(170, width * 0.36)
    value_width = 64
    bar_width = max(30, width - label_width - value_width - 6)
    max_value = max(float(value) for _, value in prepared) or 1.0

    for idx, (label, value) in enumerate(prepared):
        y = top - (idx + 1) * row_height + row_height * 0.2
        current_h = max(6, row_height * 0.6)
        current_w = bar_width * (float(value) / max_value)

        drawing.add(
            String(
                0,
                y + current_h / 2 - 3,
                _short(label, 24),
                fontName="DejaVuSans",
                fontSize=8,
                fillColor=colors.HexColor("#0f172a"),
            )
        )
        drawing.add(Rect(label_width, y, current_w, current_h, fillColor=bar_color, strokeColor=bar_color))
        drawing.add(
            String(
                label_width + current_w + 3,
                y + current_h / 2 - 3,
                f"{_fmt_money(value)} RUB",
                fontName="DejaVuSans",
                fontSize=7.5,
                fillColor=colors.HexColor("#334155"),
            )
        )

    return drawing


def export_trip_pdf(trip: Trip):
    _register_fonts()
    buffer = BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        title=f"EqualTrip trip {trip.id} report",
    )
    styles = _build_styles()
    story = []

    expenses = list(
        Expense.objects.filter(trip=trip)
        .select_related("category", "created_by")
        .prefetch_related("shares__user")
        .order_by("-created_at")
    )
    members = list(trip.memberships.select_related("user").order_by("role", "joined_at"))
    user_names = {m.user_id: m.user.username for m in members}

    by_category = defaultdict(lambda: Decimal("0"))
    by_user = defaultdict(lambda: Decimal("0"))
    total_rub = Decimal("0")
    share_rows = []

    for e in expenses:
        amount = _to_decimal(e.amount)
        amount_rub = _to_decimal(e.amount_rub)
        total_rub += amount_rub
        by_category[e.category.name if e.category else "Без категории"] += amount_rub

        shares = list(e.shares.all())
        weights = [_to_decimal(s.weight) for s in shares]
        split_mode = "none"
        if shares:
            split_mode = "custom" if any(w != weights[0] for w in weights[1:]) else "equal"
        total_weight = sum(weights, Decimal("0"))
        if total_weight > 0:
            for s, weight in zip(shares, weights):
                by_user[s.user.username] += amount_rub * weight / total_weight
        else:
            by_user[e.created_by.username] += amount_rub

        for s in shares:
            weight = _to_decimal(s.weight)
            if total_weight > 0:
                share_orig = _q2(amount * weight / total_weight)
                share_rub = _q2(amount_rub * weight / total_weight)
            else:
                share_orig = Decimal("0.00")
                share_rub = Decimal("0.00")
            share_rows.append(
                (
                    e.title,
                    s.user.username,
                    str(weight),
                    f"{share_orig} {e.currency}",
                    f"{share_rub} RUB",
                    split_mode,
                )
            )

    balance = compute_balance(trip.id)
    paid_map = {int(k): _to_decimal(v) for k, v in balance.get("paid", {}).items()}
    owed_map = {int(k): _to_decimal(v) for k, v in balance.get("owed", {}).items()}
    net_map = {int(k): _to_decimal(v) for k, v in balance.get("net", {}).items()}

    story.append(Paragraph("EqualTrip — Отчет по поездке", styles["title"]))
    story.append(Paragraph(f"Сформирован: {_fmt_dt(timezone.now())}", styles["meta"]))
    story.append(Spacer(1, 4 * mm))

    trip_period = "—"
    if trip.start_date and trip.end_date:
        trip_period = f"{trip.start_date.isoformat()} — {trip.end_date.isoformat()}"
    elif trip.start_date:
        trip_period = trip.start_date.isoformat()
    elif trip.end_date:
        trip_period = trip.end_date.isoformat()

    story.append(Paragraph("Общая информация", styles["h2"]))
    info_data = [
        ["Параметр", "Значение"],
        ["Поездка", trip.title],
        ["ID поездки", str(trip.id)],
        ["Описание", trip.description or "—"],
        ["Владелец", f"{trip.owner.username} ({trip.owner.email or '—'})"],
        ["Период поездки", trip_period],
        ["Создана", _fmt_dt(trip.created_at)],
    ]
    story.append(_build_table(info_data, [48 * mm, doc.width - 48 * mm]))
    story.append(Spacer(1, 3 * mm))

    summary_data = [
        ["Участники", "Расходы", "Категории", "Итого расходов"],
        [
            str(len(members)),
            str(len(expenses)),
            str(len(by_category)),
            f"{_fmt_money(total_rub)} RUB",
        ],
    ]
    story.append(_build_table(summary_data, [doc.width / 4] * 4))

    story.append(Paragraph("Графики", styles["h2"]))
    category_chart = _build_horizontal_bar_chart(
        "Структура расходов по категориям (RUB)",
        sorted(by_category.items(), key=lambda x: x[1], reverse=True),
        doc.width,
        135,
        colors.HexColor("#2563eb"),
    )
    if category_chart:
        story.append(category_chart)
    else:
        story.append(Paragraph("Нет данных по категориям для построения графика.", styles["body"]))
    story.append(Spacer(1, 3 * mm))

    user_chart = _build_horizontal_bar_chart(
        "Расходы по участникам после деления (RUB)",
        sorted(by_user.items(), key=lambda x: x[1], reverse=True),
        doc.width,
        135,
        colors.HexColor("#16a34a"),
    )
    if user_chart:
        story.append(user_chart)
    else:
        story.append(Paragraph("Нет данных по участникам для построения графика.", styles["body"]))

    story.append(PageBreak())
    story.append(Paragraph("Детализация расходов", styles["h2"]))
    if expenses:
        expense_table_data = [[
            "ID",
            "Название",
            "Категория",
            "Сумма",
            "RUB",
            "Оплатил",
            "Дата",
            "Чек",
            "Гео",
        ]]
        for e in expenses:
            expense_table_data.append(
                [
                    str(e.id),
                    _short(e.title, 26),
                    _short(e.category.name if e.category else "Без категории", 16),
                    f"{_fmt_money(e.amount)} {e.currency}",
                    _fmt_money(e.amount_rub),
                    _short(e.created_by.username, 14),
                    _fmt_dt(e.spent_at if e.spent_at else e.created_at),
                    "Да" if e.receipt else "Нет",
                    "Да" if e.lat is not None and e.lng is not None else "Нет",
                ]
            )
        story.append(
            _build_table(
                expense_table_data,
                [10 * mm, 34 * mm, 22 * mm, 18 * mm, 18 * mm, 24 * mm, 24 * mm, 11 * mm, 11 * mm],
            )
        )
    else:
        story.append(Paragraph("Расходов пока нет.", styles["body"]))

    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("Доли расходов", styles["h2"]))
    if share_rows:
        share_table_data = [["Расход", "Участник", "Вес", "Доля", "Доля RUB", "Тип"]]
        for row in share_rows:
            share_table_data.append(
                [
                    _short(row[0], 24),
                    _short(row[1], 16),
                    row[2],
                    row[3],
                    row[4],
                    row[5],
                ]
            )
        story.append(
            _build_table(
                share_table_data,
                [42 * mm, 36 * mm, 16 * mm, 24 * mm, 24 * mm, 20 * mm],
            )
        )
    else:
        story.append(Paragraph("Доли не найдены.", styles["body"]))

    story.append(PageBreak())
    story.append(Paragraph("Баланс и взаиморасчеты", styles["h2"]))

    all_uids = sorted(set(paid_map) | set(owed_map) | set(net_map))
    if all_uids:
        net_data = [["Участник", "Оплатил", "Доля", "Нетто"]]
        for uid in all_uids:
            net_data.append(
                [
                    user_names.get(uid, f"User#{uid}"),
                    f"{_fmt_money(paid_map.get(uid, Decimal('0')))} RUB",
                    f"{_fmt_money(owed_map.get(uid, Decimal('0')))} RUB",
                    f"{_fmt_money(net_map.get(uid, Decimal('0')))} RUB",
                ]
            )
        story.append(_build_table(net_data, [62 * mm, 35 * mm, 35 * mm, 35 * mm]))
    else:
        story.append(Paragraph("Нет данных для баланса.", styles["body"]))

    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("Рекомендуемые переводы", styles["h2"]))
    transfers = balance.get("transfers", [])
    if transfers:
        transfer_data = [["Отправитель", "Получатель", "Сумма"]]
        for t in transfers:
            from_id = int(t["from_user"])
            to_id = int(t["to_user"])
            transfer_data.append(
                [
                    user_names.get(from_id, f"User#{from_id}"),
                    user_names.get(to_id, f"User#{to_id}"),
                    f"{_fmt_money(t['amount'])} RUB",
                ]
            )
        story.append(_build_table(transfer_data, [67 * mm, 67 * mm, 36 * mm]))
    else:
        story.append(Paragraph("Баланс нулевой: никто никому не должен.", styles["body"]))

    doc.build(story)

    buffer.seek(0)
    filename = f"trip_{trip.id}_report.pdf"
    return FileResponse(buffer, as_attachment=True, filename=filename)
