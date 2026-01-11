from decimal import Decimal
from django.db.models import Sum
from trips.models import Trip
from .models import Expense


def compute_stats(trip: Trip):
    expenses = Expense.objects.filter(trip=trip).select_related("category", "created_by")

    total = expenses.aggregate(total=Sum("amount_rub"))["total"] or Decimal("0")

    by_category = {}
    for e in expenses:
        name = e.category.name if e.category else "Без категории"
        by_category.setdefault(name, Decimal("0"))
        by_category[name] += e.amount_rub

    by_user = {}
    for e in expenses:
        u = e.created_by
        by_user.setdefault(u.id, {
            "user_id": u.id,
            "username": u.username,
            "amount": Decimal("0"),
        })
        by_user[u.id]["amount"] += e.amount_rub

    return {
        "total": str(total),
        "by_category": [
            {"category": k, "amount": str(v)}
            for k, v in by_category.items()
        ],
        "by_user": [
            {**v, "amount": str(v["amount"])}
            for v in by_user.values()
        ],
    }