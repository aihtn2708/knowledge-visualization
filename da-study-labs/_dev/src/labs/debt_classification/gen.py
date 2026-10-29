import random, datetime as dt, json

def generate():
    random.seed(20260930)
    fixed = [(9,0),(10,0),(90,60),(91,61),(180,150),(181,151),(360,330),(361,331),
             (39,9),(40,10),(120,90),(121,91),(210,180),(211,181),(390,360),(391,361)]
    rnd = []
    def add(n, lo, hi, prevf):
        for _ in range(n):
            d = random.randint(lo, hi); rnd.append((d, prevf(d)))
    def cure(d):
        return 0 if random.random() < 0.8 else random.randint(12, 95)
    add(72, 0, 0, cure)
    add(8, 1, 9, lambda d: 0)
    add(8, 10, 30, lambda d: 0)
    add(10, 31, 90, lambda d: d - 30)
    add(3, 91, 180, lambda d: d - 30)
    add(2, 181, 360, lambda d: d - 30)
    add(1, 392, 600, lambda d: d - 30)
    pairs = fixed + rnd
    random.shuffle(pairs)
    N = len(pairs); assert N == 120
    # customers: 70, first 70 loans one each, rest random with weights
    cust = list(range(3001, 3071))
    owners = cust[:]
    random.shuffle(owners)
    extra = [random.choice(cust[:40]) for _ in range(N - 70)]
    owners = owners + extra
    random.shuffle(owners)
    products = {"Personal loan": (20, 200), "Motorbike loan": (15, 60), "Credit card": (5, 50), "Appliance installment": (5, 30)}
    pl = list(products)
    asof = dt.date(2026, 9, 30)
    loans = []
    for i, ((dpd, prev), cid) in enumerate(zip(pairs, owners)):
        p = random.choices(pl, [4, 3, 4, 3])[0]
        lo, hi = products[p]
        principal = random.randint(lo, hi) * 1_000_000
        latest = asof - dt.timedelta(days=dpd + 60)
        earliest = dt.date(2024, 6, 1)
        if latest < earliest: latest = earliest + dt.timedelta(days=30)
        d0 = earliest + dt.timedelta(days=random.randint(0, (latest - earliest).days))
        u = random.uniform(0.35, 0.98)
        outstanding = max(1_000_000, round(principal * u / 100_000) * 100_000)
        loans.append([7001 + i, cid, p, d0.isoformat(), principal, outstanding, dpd, prev])
    loans.sort(key=lambda r: r[0])
    rules = [[1, "Pass", 0, 9, 0.0], [2, "Special mention", 10, 90, 0.05], [3, "Substandard", 91, 180, 0.20],
             [4, "Doubtful", 181, 360, 0.50], [5, "Loss", 361, 99999, 1.00]]
    return loans, rules

if __name__ == "__main__":
    l, r = generate()
    def g(d): return [x[0] for x in r if x[2] <= d <= x[3]][0]
    from collections import Counter
    print(Counter(g(x[6]) for x in l), Counter(g(x[7]) for x in l))
    worst = {}
    for x in l: worst[x[1]] = max(worst.get(x[1], 0), g(x[6]))
    print(Counter(worst[x[1]] for x in l), sum(1 for x in l if worst[x[1]] != g(x[6])), len(set(x[1] for x in l)))
    print(Counter((g(x[7]), g(x[6])) for x in l))
