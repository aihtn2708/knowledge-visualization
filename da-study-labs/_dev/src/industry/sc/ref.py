import json
from ortools.constraint_solver import pywrapcp, routing_enums_pb2
LOC = [(4,4),(2,0),(8,0),(0,1),(1,1),(5,2),(7,2),(3,3),(6,3),(5,5),(8,5),(1,6),(2,6),(3,7),(6,7),(0,8),(7,8)]
DEM = [0,1,1,2,4,2,4,8,8,1,2,1,2,4,4,8,8]
DOC = [[0,548,776,696,582,274,502,194,308,194,536,502,388,354,468,776,662],[548,0,684,308,194,502,730,354,696,742,1084,594,480,674,1016,868,1210]]
M = [[abs(a[0]-b[0])*114 + abs(a[1]-b[1])*80 for b in LOC] for a in LOC]
assert M[0] == DOC[0] and M[1] == DOC[1], "coordinates do not reproduce the docs matrix"
def solve(cap, nveh, seconds=5):
    man = pywrapcp.RoutingIndexManager(len(M), nveh, 0); r = pywrapcp.RoutingModel(man)
    cb = r.RegisterTransitCallback(lambda i, j: M[man.IndexToNode(i)][man.IndexToNode(j)]); r.SetArcCostEvaluatorOfAllVehicles(cb)
    dcb = r.RegisterUnaryTransitCallback(lambda i: DEM[man.IndexToNode(i)]); r.AddDimensionWithVehicleCapacity(dcb, 0, [cap]*nveh, True, "Capacity")
    p = pywrapcp.DefaultRoutingSearchParameters()
    p.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    p.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    p.time_limit.FromSeconds(seconds)
    s = r.SolveWithParameters(p)
    routes = []
    for v in range(nveh):
        i = r.Start(v); route = []
        while not r.IsEnd(i):
            route.append(man.IndexToNode(i)); i = s.Value(r.NextVar(i))
        if len(route) > 1: routes.append(route[1:])
    return s.ObjectiveValue(), routes
out = {}
for cap, nveh in ((15, 4), (20, 4), (30, 4), (60, 4)):
    obj, routes = solve(cap, nveh)
    out[str(cap)] = {"distance": obj, "routes": routes}
    print(cap, nveh, obj, routes)
json.dump({"loc": LOC, "dem": DEM, "ortools": out}, open("ref.json", "w"))
