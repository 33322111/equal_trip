import csv
from django.http import HttpResponse
from django.utils.timezone import localtime

from trips.models import Trip
from .models import Expense
from .services import compute_balance


def export_trip_csv(trip: Trip):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="trip_{trip.id}_expenses.csv"'

    writer = csv.writer(response)

    # Заголовок
    writer.writerow(["Trip", trip.title])
    writer.writerow([])
    writer.writerow(["Expenses"])

    writer.writerow([
        "Title",
        "Amount",
        "Currency",
        "Category",
        "Paid by",
        "Date",
        "Latitude",
        "Longitude",
    ])

    expenses = Expense.objects.filter(trip=trip).select_related("category", "created_by")

    for e in expenses:
        writer.writerow([
            e.title,
            str(e.amount),
            e.currency,
            e.category.name if e.category else "",
            e.created_by.username,
            localtime(e.spent_at).strftime("%Y-%m-%d %H:%M") if e.spent_at else "",
            e.lat or "",
            e.lng or "",
        ])

    # Баланс
    writer.writerow([])
    writer.writerow(["Balance (who owes whom)"])

    balance = compute_balance(trip.id)
    writer.writerow(["From", "To", "Amount"])

    for t in balance["transfers"]:
        writer.writerow([
            t["from_user"],
            t["to_user"],
            t["amount"],
        ])

    return response