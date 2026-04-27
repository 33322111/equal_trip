from decimal import Decimal, ROUND_HALF_UP
from django.db.models import Sum
from trips.models import Trip
from .models import Expense


def quant2(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def compute_stats(trip: Trip):
    expenses = Expense.objects.filter(trip=trip).select_related("category", "created_by").prefetch_related("shares__user")

    total = expenses.aggregate(total=Sum("amount_rub"))["total"] or Decimal("0")

    by_category = {}
    for e in expenses:
        name = e.category.name if e.category else "Без категории"
        by_category.setdefault(name, Decimal("0"))
        by_category[name] += e.amount_rub

    by_user = {}
    for e in expenses:
        shares = list(e.shares.all())
        if shares:
            total_weight = sum((Decimal(str(s.weight)) for s in shares), Decimal("0"))
            if total_weight > 0:
                for s in shares:
                    u = s.user
                    by_user.setdefault(
                        u.id,
                        {
                            "user_id": u.id,
                            "username": u.username,
                            "amount": Decimal("0"),
                        },
                    )
                    by_user[u.id]["amount"] += Decimal(str(e.amount_rub)) * Decimal(str(s.weight)) / total_weight
                continue

        u = e.created_by
        by_user.setdefault(
            u.id,
            {
                "user_id": u.id,
                "username": u.username,
                "amount": Decimal("0"),
            },
        )
        by_user[u.id]["amount"] += Decimal(str(e.amount_rub))

    return {
        "total": str(total),
        "by_category": [
            {"category": k, "amount": str(v)}
            for k, v in by_category.items()
        ],
        "by_user": [
            {**v, "amount": str(quant2(v["amount"]))}
            for v in by_user.values()
        ],
    }
