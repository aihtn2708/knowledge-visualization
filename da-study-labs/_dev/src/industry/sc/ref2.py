import json
from ortools.constraint_solver import pywrapcp, routing_enums_pb2
R = json.load(open("ref.json")); LOC, DEM = R["loc"], R["dem"]
M = [[abs(a[0]-b[0])*114 + abs(a[1]-b[1])*80 for b in LOC] for a in LOC]
N = len(M)
def rdist(route): 
    seq = [0] + route + [0]; return sum(M[a][b] for a, b in zip(seq, seq[1:]))
def two_opt(route):
    best = route[:]; improved = True
    while improved:
        improved = False
        for i in range(len(best) - 1):
            for j in range(i + 1, len(best)):
                cand = best[:i] + best[i:j+1][::-1] + best[j+1:]
                if rdist(cand) < rdist(best): best = cand; improved = True
    return best
def nearest(cap):
    left = set(range(1, N)); routes = []
    while left:
        load, cur, route = 0, 0, []
        while True:
            cand = [c for c in left if load + DEM[c] <= cap]
            if not cand: break
            nxt = min(cand, key=lambda c: (M[cur][c], c))
            route.append(nxt); load += DEM[nxt]; left.discard(nxt); cur = nxt
        routes.append(route)
    return routes
def savings(cap):
    routes = {i: [i] for i in range(1, N)}; owner = {i: i for i in range(1, N)}; load = {i: DEM[i] for i in range(1, N)}
    S = sorted(((M[0][i] + M[0][j] - M[i][j], i, j) for i in range(1, N) for j in range(i + 1, N)), key=lambda t: (-t[0], t[1], t[2]))
    for s, i, j in S:
        if s <= 0: break
        ri, rj = owner[i], owner[j]
        if ri == rj or load[ri] + load[rj] > cap: continue
        a, b = routes[ri], routes[rj]
        if a[-1] == i and b[0] == j: new = a + b
        elif a[0] == i and b[-1] == j: new = b + a
        elif a[0] == i and b[0] == j: new = a[::-1] + b
        elif a[-1] == i and b[-1] == j: new = a + b[::-1]
        else: continue
        routes[ri] = new; load[ri] += load[rj]; del routes[rj]; del load[rj]
        for c in new: owner[c] = ri
    return list(routes.values())
out = {}
for cap in (15, 20, 30, 40, 60):
    nn = nearest(cap); sv = savings(cap)
    out[cap] = dict(nn=sum(map(rdist, nn)), nn2=sum(rdist(two_opt(r)) for r in nn), sv=sum(map(rdist, sv)), sv2=sum(rdist(two_opt(r)) for r in sv), nnv=len(nn), svv=len(sv))
    print(cap, out[cap])
# truck types with fixed cost: cost per day = fixed + km * rate ; 1 distance unit = 10 m
TRUCKS = [("1.5-tonne van", 15, 450000, 9000), ("3.5-tonne truck", 30, 700000, 12000), ("8-tonne truck", 60, 1200000, 18000)]
def solve(cap, nveh, fixed, rate):
    man = pywrapcp.RoutingIndexManager(N, nveh, 0); r = pywrapcp.RoutingModel(man)
    cb = r.RegisterTransitCallback(lambda i, j: M[man.IndexToNode(i)][man.IndexToNode(j)] * rate // 100)   # VND per unit (rate per km / 100)
    r.SetArcCostEvaluatorOfAllVehicles(cb); r.SetFixedCostOfAllVehicles(fixed)
    dcb = r.RegisterUnaryTransitCallback(lambda i: DEM[man.IndexToNode(i)]); r.AddDimensionWithVehicleCapacity(dcb, 0, [cap]*nveh, True, "Capacity")
    p = pywrapcp.DefaultRoutingSearchParameters()
    p.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    p.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    p.time_limit.FromSeconds(8)
    s = r.SolveWithParameters(p); routes = []
    for v in range(nveh):
        i = r.Start(v); route = []
        while not r.IsEnd(i): route.append(man.IndexToNode(i)); i = s.Value(r.NextVar(i))
        if len(route) > 1: routes.append(route[1:])
    dist = sum(map(rdist, routes))
    return dict(routes=routes, distance=dist, km=dist / 100, vehicles=len(routes), cost=len(routes) * fixed + dist * rate / 100)
tr = {}
for name, cap, fixed, rate in TRUCKS:
    tr[name] = dict(cap=cap, fixed=fixed, rate=rate, **solve(cap, 6, fixed, rate)); print(name, {k: v for k, v in tr[name].items() if k != "routes"}, tr[name]["routes"])
R["heur"] = out; R["trucks"] = tr
json.dump(R, open("ref.json", "w"))
