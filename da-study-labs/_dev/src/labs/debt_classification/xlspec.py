# Excel layouts (what the page shows) and the reference formulas. Single source of truth for page + workbook.
N = 120
LAST = N + 1
def L(c): return f"loans!${c}$2:${c}${LAST}"
def R(c): return f"rules!${c}$2:${c}$6"

def bounds(col, ref):  # criteria pair for "dpd inside the group's range"
    return f'{L(col)},">="&INDEX({R("C")},{ref}),{L(col)},"<="&INDEX({R("D")},{ref})'

def spec(loans):
    X = {}
    X[1] = dict(rows=6, ncols=4, rightLimit=4, cols=[1, 2, 3, 4], resRows=[2, 6], ends={},
        pre=[["grp", "label", "loans", "outstanding"], [1], [2], [3], [4], [5]],
        sol=[["B2", f"=INDEX({R('B')},A2)", "down"],
             ["C2", f"=COUNTIFS({bounds('G','A2')})", "down"],
             ["D2", f"=SUMIFS({L('F')},{bounds('G','A2')})", "down"]])
    X[2] = dict(rows=6, ncols=4, rightLimit=4, cols=[1, 2, 3, 4], resRows=[2, 6], ends={},
        pre=[["grp", "outstanding", "provision_rate", "provision"], [1], [2], [3], [4], [5]],
        sol=[["B2", f"=SUMIFS({L('F')},{bounds('G','A2')})", "down"],
             ["C2", f"=INDEX({R('E')},A2)", "down"],
             ["D2", "=ROUND(B2*C2,0)", "down"]])
    X[3] = dict(rows=9, ncols=5, rightLimit=5, cols=[1, 2, 3, 4, 5], resRows=[2, 2], ends={},
        pre=[["total_outstanding", "npl_outstanding", "npl_ratio_pct", "total_provision", "coverage_pct"],
             [], [], ["grp", "outstanding", "provision"], [1], [2], [3], [4], [5]],
        sol=[["B5", f"=SUMIFS({L('F')},{bounds('G','A5')})", "down"],
             ["C5", f"=ROUND(B5*INDEX({R('E')},A5),0)", "down"],
             ["A2", "=SUM(B5:B9)", None], ["B2", "=SUM(B7:B9)", None],
             ["C2", "=ROUND(100*B2/A2,2)", None], ["D2", "=SUM(C5:C9)", None],
             ["E2", "=ROUND(100*D2/B2,2)", None]])
    pre4 = [["loan_id", "customer_id", "outstanding", "dpd", "own_grp", "worst_grp", None, "grp", "loans", "outstanding"]]
    for i, l in enumerate(loans):
        row = [l[0], l[1], l[5], l[6], None, None, None]
        if i < 5: row += [i + 1]
        pre4.append(row)
    X[4] = dict(rows=LAST, ncols=10, rightLimit=10, cols=[8, 9, 10], resRows=[2, 6], ends={"9": 6, "10": 6},
        pre=pre4,
        sol=[["E2", f"=MATCH(D2,{R('C')},1)", "down"],
             ["F2", f"=MAXIFS($E$2:$E${LAST},$B$2:$B${LAST},B2)", "down"],
             ["I2", f"=COUNTIF($F$2:$F${LAST},H2)", "down"],
             ["J2", f"=SUMIFS($C$2:$C${LAST},$F$2:$F${LAST},H2)", "down"]])
    X[5] = dict(rows=6, ncols=6, rightLimit=6, cols=[1, 2, 3, 4, 5, 6], resRows=[2, 6], ends={},
        pre=[["from_grp", 1, 2, 3, 4, 5], [1], [2], [3], [4], [5]],
        sol=[["B2", f'=COUNTIFS({L("H")},">="&INDEX({R("C")},$A2),{L("H")},"<="&INDEX({R("D")},$A2),'
                    f'{L("G")},">="&INDEX({R("C")},B$1),{L("G")},"<="&INDEX({R("D")},B$1))', "both"]])
    return X
