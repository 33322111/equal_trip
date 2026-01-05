from decimal import Decimal, ROUND_HALF_UP
from collections import defaultdict

from .models import Expense
from payments.models import Settlement


def quant2(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def compute_balance(trip_id: int):
    # paid_by_user
    paid = defaultdict(Decimal)
    owed = defaultdict(Decimal)

    expenses = Expense.objects.filter(trip_id=trip_id).prefetch_related("shares")
    for e in expenses:
        paid[e.created_by_id] += Decimal(e.amount)

        shares = list(e.shares.all())
        if not shares:
            continue
        total_weight = sum([Decimal(s.weight) for s in shares])
        if total_weight == 0:
            continue

        for s in shares:
            part = (Decimal(e.amount) * Decimal(s.weight) / total_weight)
            owed[s.user_id] += part

    # net: + получает, - должен
    net = {}
    user_ids = set(list(paid.keys()) + list(owed.keys()))
    for uid in user_ids:
        net[uid] = quant2(paid[uid] - owed[uid])

    # Учитываем подтверждённые оплаты (settlements)
    # Если A оплатил B => A "меньше должен", B "меньше должен получить"
    confirmed = Settlement.objects.filter(
        trip_id=trip_id,
        status=Settlement.Status.CONFIRMED,
    ).values("from_user_id", "to_user_id", "amount")

    for s in confirmed:
        amt = quant2(Decimal(s["amount"]))
        if amt <= 0:
            continue

        from_uid = s["from_user_id"]
        to_uid = s["to_user_id"]

        # Если вдруг пользователь не участвовал в расходах, он мог не попасть в net.
        # Добавим его с 0, чтобы корректно сработало.
        if from_uid not in net:
            net[from_uid] = Decimal("0.00")
        if to_uid not in net:
            net[to_uid] = Decimal("0.00")

        net[from_uid] = quant2(net[from_uid] + amt)
        net[to_uid] = quant2(net[to_uid] - amt)

        user_ids.add(from_uid)
        user_ids.add(to_uid)

    # превращаем net в список трансферов (должник -> кредитор)
    debtors = []
    creditors = []
    for uid, val in net.items():
        if val < 0:
            debtors.append([uid, -val])
        elif val > 0:
            creditors.append([uid, val])

    transfers = []
    i = j = 0
    while i < len(debtors) and j < len(creditors):
        duid, damount = debtors[i]
        cuid, camount = creditors[j]

        x = damount if damount <= camount else camount
        x = quant2(x)

        if x > 0:
            transfers.append({"from_user": duid, "to_user": cuid, "amount": str(x)})

        damount = quant2(damount - x)
        camount = quant2(camount - x)

        debtors[i][1] = damount
        creditors[j][1] = camount

        if damount == 0:
            i += 1
        if camount == 0:
            j += 1

    return {
        "paid": {str(k): str(quant2(v)) for k, v in paid.items()},
        "owed": {str(k): str(quant2(v)) for k, v in owed.items()},
        "net": {str(k): str(v) for k, v in net.items()},
        "transfers": transfers,
    }