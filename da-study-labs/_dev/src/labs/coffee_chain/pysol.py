PYPLAIN = {}
PYPLAIN[1] = '''names = {s["store_id"]: s["store_name"] for s in stores}

totals = {}
for o in orders:
    if o["status"] == "completed":
        totals[o["store_id"]] = totals.get(o["store_id"], 0) + o["qty"] * o["unit_price"]

result = [(names[sid], revenue) for sid, revenue in totals.items()]
result.sort(key=lambda row: row[1], reverse=True)'''
PYPLAIN[2] = '''names = {s["store_id"]: s["store_name"] for s in stores}

total = {}
cancelled = {}
for o in orders:
    sid = o["store_id"]
    total[sid] = total.get(sid, 0) + 1
    if o["status"] == "cancelled":
        cancelled[sid] = cancelled.get(sid, 0) + 1

result = []
for sid in total:
    c = cancelled.get(sid, 0)
    result.append((names[sid], total[sid], c, round(100 * c / total[sid], 1)))
result.sort(key=lambda row: row[3], reverse=True)'''
PYPLAIN[3] = '''monthly = {}
for o in orders:
    if o["status"] == "completed":
        month = o["order_date"][:7]
        monthly[month] = monthly.get(month, 0) + o["qty"] * o["unit_price"]

result = []
previous = None
for month in sorted(monthly):
    revenue = monthly[month]
    growth = None if previous is None else round(100 * (revenue - previous) / previous, 1)
    result.append((month, revenue, growth))
    previous = revenue'''
PYPLAIN[4] = '''names = {s["store_id"]: s["store_name"] for s in stores}

revenue = {}
for o in orders:
    if o["status"] == "completed":
        key = (o["store_id"], o["product"])
        revenue[key] = revenue.get(key, 0) + o["qty"] * o["unit_price"]

best = {}
for key, value in revenue.items():
    sid, product = key
    if sid not in best or value > best[sid][1]:
        best[sid] = (product, value)

result = [(names[sid], best[sid][0], best[sid][1]) for sid in best]
result.sort()'''
