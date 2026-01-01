from io import BytesIO
from decimal import Decimal

from django.http import FileResponse
from django.utils.timezone import localtime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from trips.models import Trip
from .models import Expense
from .services import compute_balance

import os
from django.conf import settings
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont


def export_trip_pdf(trip: Trip):
    """
    MVP PDF: заголовок + список расходов + блок "кто кому должен".
    Без сложных таблиц.
    """
    buffer = BytesIO()

    fonts_dir = os.path.join(settings.BASE_DIR, "assets", "fonts")
    pdfmetrics.registerFont(TTFont("DejaVuSans", os.path.join(fonts_dir, "DejaVuSans.ttf")))
    pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", os.path.join(fonts_dir, "DejaVuSans-Bold.ttf")))
    pdfmetrics.registerFont(TTFont("DejaVuSans-Oblique", os.path.join(fonts_dir, "DejaVuSans-Oblique.ttf")))

    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    # Поля
    left = 20 * mm
    top = height - 20 * mm
    line_h = 6 * mm

    y = top

    # Заголовок
    c.setFont("DejaVuSans-Bold", 16)
    c.drawString(left, y, f"EqualTrip — Отчет по поездке")
    y -= 10 * mm

    c.setFont("DejaVuSans", 10)
    c.drawString(left, y, f"Поездка: {trip.title} (ID: {trip.id})")
    y -= 8 * mm

    # Расходы
    c.setFont("DejaVuSans-Bold", 16)
    c.drawString(left, y, "Расходы")
    y -= 7 * mm

    expenses = (
        Expense.objects.filter(trip=trip)
        .select_related("category", "created_by")
        .order_by("-created_at")
    )

    c.setFont("DejaVuSans", 10)

    if not expenses.exists():
        c.drawString(left, y, "Расходов нет.")
        y -= line_h
    else:
        for e in expenses:
            cat = e.category.name if e.category else "Без категории"
            paid_by = e.created_by.username
            dt = localtime(e.spent_at).strftime("%Y-%m-%d %H:%M") if e.spent_at else ""
            line = f"- {e.title} | {e.amount} {e.currency} | {cat} | оплатил: {paid_by} | {dt}"
            c.drawString(left, y, line[:120])  # простая защита от слишком длинных строк
            y -= line_h

            # если место есть — добавим координаты
            if e.lat is not None and e.lng is not None:
                c.setFont("DejaVuSans-Oblique", 9)
                c.drawString(left + 8 * mm, y, f"координаты: {e.lat}, {e.lng}")
                c.setFont("DejaVuSans", 10)
                y -= line_h

            # если место на странице закончилось
            if y < 20 * mm:
                c.showPage()
                y = top
                c.setFont("DejaVuSans", 10)

    # Баланс
    if y < 35 * mm:
        c.showPage()
        y = top
        c.setFont("DejaVuSans", 10)

    y -= 4 * mm
    c.setFont("DejaVuSans-Bold", 12)
    c.drawString(left, y, "Баланс (кто кому должен)")
    y -= 7 * mm

    balance = compute_balance(trip.id)
    transfers = balance.get("transfers", [])

    c.setFont("DejaVuSans", 10)
    if not transfers:
        c.drawString(left, y, "Баланс нулевой — никто никому не должен.")
        y -= line_h
    else:
        # Для удобства: сопоставим user_id -> username
        members = {m.user_id: m.user.username for m in trip.memberships.select_related("user").all()}
        for t in transfers:
            from_name = members.get(t["from_user"], f"User#{t['from_user']}")
            to_name = members.get(t["to_user"], f"User#{t['to_user']}")
            c.drawString(left, y, f"- {from_name} → {to_name}: {t['amount']} RUB")
            y -= line_h
            if y < 20 * mm:
                c.showPage()
                y = top
                c.setFont("DejaVuSans", 10)

    c.showPage()
    c.save()

    buffer.seek(0)
    filename = f"trip_{trip.id}_report.pdf"
    return FileResponse(buffer, as_attachment=True, filename=filename)