import csv
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from django.http import HttpResponse
from django.utils import timezone
from django.utils.timezone import localtime

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
        return ""
    return localtime(value).strftime("%Y-%m-%d %H:%M")


def _split_mode(shares) -> str:
    if not shares:
        return "none"
    weights = [_to_decimal(s.weight) for s in shares]
    return "custom" if any(w != weights[0] for w in weights[1:]) else "equal"


def export_trip_csv(trip: Trip):
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="trip_{trip.id}_expenses.csv"'
    response.write("\ufeff")

    writer = csv.writer(response)

    expenses = list(
        Expense.objects.filter(trip=trip)
        .select_related("category", "created_by")
        .prefetch_related("shares__user")
        .order_by("-created_at")
    )
    members = list(trip.memberships.select_related("user").order_by("role", "joined_at"))

    total_rub = Decimal("0")
    by_category = defaultdict(lambda: Decimal("0"))
    by_user = defaultdict(lambda: Decimal("0"))
    for e in expenses:
        amount_rub = _to_decimal(e.amount_rub)
        total_rub += amount_rub
        by_category[e.category.name if e.category else "Без категории"] += amount_rub
        shares = list(e.shares.all())
        if shares:
            total_weight = sum((_to_decimal(s.weight) for s in shares), Decimal("0"))
            if total_weight > 0:
                for s in shares:
                    by_user[s.user.username] += amount_rub * _to_decimal(s.weight) / total_weight
                continue

        by_user[e.created_by.username] += amount_rub

    writer.writerow(["EqualTrip Trip Report"])
    writer.writerow(["Generated at", _fmt_dt(timezone.now())])
    writer.writerow([])
    writer.writerow(["Trip info"])
    writer.writerow(["Trip ID", trip.id])
    writer.writerow(["Title", trip.title])
    writer.writerow(["Description", trip.description or ""])
    writer.writerow(["Owner", trip.owner.username])
    writer.writerow(["Owner email", trip.owner.email or ""])
    writer.writerow(["Start date", trip.start_date.isoformat() if trip.start_date else ""])
    writer.writerow(["End date", trip.end_date.isoformat() if trip.end_date else ""])
    writer.writerow(["Created at", _fmt_dt(trip.created_at)])
    writer.writerow(["Members count", len(members)])
    writer.writerow(["Expenses count", len(expenses)])
    writer.writerow(["Total expenses, RUB", str(_q2(total_rub))])

    writer.writerow([])
    writer.writerow(["Members"])
    writer.writerow(["User ID", "Username", "Email", "Role", "Joined at"])
    for m in members:
        writer.writerow([
            m.user_id,
            m.user.username,
            m.user.email or "",
            m.role,
            _fmt_dt(m.joined_at),
        ])

    writer.writerow([])
    writer.writerow(["Expenses detailed"])
    writer.writerow([
        "Expense ID",
        "Title",
        "Amount",
        "Currency",
        "FX rate",
        "Amount RUB",
        "Category",
        "Paid by",
        "Paid by email",
        "Spent at",
        "Created at",
        "Latitude",
        "Longitude",
        "Receipt attached",
        "Split mode",
        "Participants count",
    ])
    for e in expenses:
        shares = list(e.shares.all())
        writer.writerow([
            e.id,
            e.title,
            str(_q2(_to_decimal(e.amount))),
            e.currency,
            str(e.fx_rate),
            str(_q2(_to_decimal(e.amount_rub))),
            e.category.name if e.category else "",
            e.created_by.username,
            e.created_by.email or "",
            _fmt_dt(e.spent_at),
            _fmt_dt(e.created_at),
            e.lat or "",
            e.lng or "",
            "yes" if e.receipt else "no",
            _split_mode(shares),
            len(shares),
        ])

    writer.writerow([])
    writer.writerow(["Expense shares"])
    writer.writerow([
        "Expense ID",
        "Expense title",
        "User ID",
        "Username",
        "Weight",
        "Share amount (original currency)",
        "Share amount (RUB)",
    ])
    for e in expenses:
        shares = list(e.shares.all())
        total_weight = sum((_to_decimal(s.weight) for s in shares), Decimal("0"))
        amount = _to_decimal(e.amount)
        amount_rub = _to_decimal(e.amount_rub)
        for s in shares:
            weight = _to_decimal(s.weight)
            if total_weight > 0:
                share_amount = _q2(amount * weight / total_weight)
                share_amount_rub = _q2(amount_rub * weight / total_weight)
            else:
                share_amount = Decimal("0.00")
                share_amount_rub = Decimal("0.00")
            writer.writerow([
                e.id,
                e.title,
                s.user_id,
                s.user.username,
                str(weight),
                f"{share_amount} {e.currency}",
                str(share_amount_rub),
            ])

    writer.writerow([])
    writer.writerow(["Totals by category (RUB)"])
    writer.writerow(["Category", "Amount RUB"])
    for category, value in sorted(by_category.items(), key=lambda x: x[1], reverse=True):
        writer.writerow([category, str(_q2(value))])

    writer.writerow([])
    writer.writerow(["Totals by participant after split (RUB)"])
    writer.writerow(["Username", "Amount RUB"])
    for username, value in sorted(by_user.items(), key=lambda x: x[1], reverse=True):
        writer.writerow([username, str(_q2(value))])

    balance = compute_balance(trip.id)
    user_names = {m.user_id: m.user.username for m in members}

    writer.writerow([])
    writer.writerow(["Balance summary (RUB)"])
    writer.writerow(["Username", "Paid", "Owed", "Net"])

    paid_map = {int(k): _to_decimal(v) for k, v in balance.get("paid", {}).items()}
    owed_map = {int(k): _to_decimal(v) for k, v in balance.get("owed", {}).items()}
    net_map = {int(k): _to_decimal(v) for k, v in balance.get("net", {}).items()}

    all_balance_users = sorted(set(paid_map) | set(owed_map) | set(net_map))
    for uid in all_balance_users:
        writer.writerow([
            user_names.get(uid, f"User#{uid}"),
            str(_q2(paid_map.get(uid, Decimal("0")))),
            str(_q2(owed_map.get(uid, Decimal("0")))),
            str(_q2(net_map.get(uid, Decimal("0")))),
        ])

    writer.writerow([])
    writer.writerow(["Recommended transfers"])
    writer.writerow(["From user ID", "From username", "To user ID", "To username", "Amount RUB"])
    for t in balance.get("transfers", []):
        from_id = int(t["from_user"])
        to_id = int(t["to_user"])
        writer.writerow([
            from_id,
            user_names.get(from_id, f"User#{from_id}"),
            to_id,
            user_names.get(to_id, f"User#{to_id}"),
            t["amount"],
        ])

    return response
