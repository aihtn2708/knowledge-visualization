import random, datetime as dt, math

PRODUCTS = [  # product_id, name, min_score, min_income, max_amount, max_term, flat_rate, max_dti, thin_file_ok
    [1, "Prime",    700, 15_000_000, 300_000_000, 48, 0.10, 0.50, 0],
    [2, "Standard", 600, 10_000_000, 150_000_000, 36, 0.16, 0.45, 0],
    [3, "Starter",  500,  7_000_000,  50_000_000, 24, 0.24, 0.40, 0],
    [4, "Micro",    400,  5_000_000,  15_000_000, 12, 0.30, 0.35, 1],
]
MIN_OFFER = 5_000_000

def generate(seed):
    rnd = random.Random(seed)
    N = 80
    apps, hist = [], []
    n_hist = 60
    classes = ["clean"] * 37 + ["watch"] * 15 + ["severe"] * 8
    rnd.shuffle(classes)
    ids = list(range(5001, 5001 + N))
    # fixed edge-case applicants: (income, score, class, worst_dpd) -> placed first
    edge = [(10_000_000, 600, "clean", 0), (7_000_000, 500, "clean", 9), (15_000_000, 700, "clean", 5),
            (5_000_000, 400, "watch", 10), (12_000_000, 650, "watch", 90), (20_000_000, 710, "severe", 91),
            (9_000_000, None, None, None), (5_000_000, None, None, None)]
    plan = []
    for inc, sc, cl, w in edge: plan.append((inc, sc, cl, w))
    ci = iter(classes)
    while len(plan) < N:
        if sum(1 for p in plan if p[2]) < n_hist:
            plan.append((None, None, next(ci), None))
        else:
            plan.append((None, None, None, None))
    # re-shuffle everything except keep ids sequential after shuffle
    rnd.shuffle(plan)
    for aid, (inc, sc, cl, w) in zip(ids, plan):
        if inc is None:
            inc = int(round(math.exp(rnd.gauss(16.3, 0.45)) / 500_000)) * 500_000
            inc = min(max(inc, 4_500_000), 45_000_000)
        if cl == "clean":
            sc = sc if sc else int(min(850, max(560, rnd.gauss(725, 65))))
        elif cl == "watch":
            sc = sc if sc else int(min(690, max(450, rnd.gauss(590, 55))))
        elif cl == "severe":
            sc = sc if sc else int(min(520, max(300, rnd.gauss(430, 55))))
        ex = 0 if rnd.random() < 0.4 else int(round(inc * rnd.uniform(0.05, 0.4) / 100_000)) * 100_000
        req = int(round(min(200, max(5, inc * rnd.uniform(2.5, 11) / 1_000_000))))
        req *= 1_000_000
        term = rnd.choice([6, 12, 12, 18, 24, 24, 36, 36, 48])
        apps.append([aid, inc, ex, sc, req, term])
        if cl:
            k = rnd.choice([1, 2, 2, 3, 4])
            if w is None:
                w = rnd.randint(0, 9) if cl == "clean" else rnd.randint(11, 89) if cl == "watch" else rnd.randint(92, 400)
            dpds = [w] + [rnd.randint(0, 9) if cl == "clean" else rnd.randint(0, 9) for _ in range(k - 1)]
            if cl == "clean": dpds = [min(d, 9) for d in dpds]
            rnd.shuffle(dpds)
            for d in dpds:
                hist.append([aid, rnd.choice(["Personal loan", "Motorbike loan", "Credit card", "Appliance installment"]),
                             (dt.date(2022, 1, 1) + dt.timedelta(days=rnd.randint(0, 1400))).isoformat(),
                             rnd.randint(5, 80) * 1_000_000, d,
                             "written_off" if d > 360 else ("closed" if rnd.random() < 0.6 else "active")])
    hist.sort(key=lambda r: (r[2], r[0]))
    hist = [[7001 + i] + r for i, r in enumerate(hist)]
    apps.sort(key=lambda r: r[0])
    return apps, hist

if __name__ == "__main__":
    import sys
    a, h = generate(int(sys.argv[1]) if len(sys.argv) > 1 else 1)
    print(len(a), len(h), sum(1 for x in a if x[3] is None))
