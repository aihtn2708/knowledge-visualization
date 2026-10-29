NA, NH = 80, 0   # NH set by build
def cfgs(apps, hist, products, worst, rec):
    na, nh = len(apps), len(hist)
    A = lambda c: f"applicants!${c}$2:${c}${na+1}"
    H = lambda c: f"history!${c}$2:${c}${nh+1}"
    P = lambda c: f"products!${c}$2:${c}$5"
    L = na + 1
    X = {}
    # T1
    X[1] = dict(rows=5, ncols=5, rightLimit=5, cols=[1, 4, 5], resRows=[2, 5], ends={"4": 4, "5": 4},
        pre=[["band", "min_score", "max_score", "applicants", "avg_income"], ["High", 701, 850], ["Medium", 501, 700], ["Low", 300, 500], ["No score"]],
        sol=[["D2", f'=COUNTIFS({A("D")},">="&B2,{A("D")},"<="&C2)', "down"],
             ["E2", f'=ROUND(AVERAGEIFS({A("B")},{A("D")},">="&B2,{A("D")},"<="&C2),0)', "down"],
             ["D5", f'=COUNTIFS({A("D")},"=")', None],
             ["E5", f'=ROUND(AVERAGEIFS({A("B")},{A("D")},"="),0)', None]])
    # T2
    pre = [["applicant_id", "credit_score", "worst_dpd", "history_class", None, "history_class", "applicants", "avg_score"]]
    labels = ["No history", "Clean", "Watch", "Severe"]
    for i, a in enumerate(apps):
        row = [a[0], a[3], None, None, None]
        if i < 4: row += [labels[i]]
        pre.append(row)
    X[2] = dict(rows=L, ncols=8, rightLimit=8, cols=[6, 7, 8], resRows=[2, 5], ends={"7": 5, "8": 5}, pre=pre,
        sol=[["C2", f'=IF(COUNTIF({H("B")},A2)=0,"",MAXIFS({H("F")},{H("B")},A2))', "down"],
             ["D2", '=IF(C2="","No history",IF(C2>=91,"Severe",IF(C2>=10,"Watch","Clean")))', "down"],
             ["G2", f"=COUNTIF($D$2:$D${L},F2)", "down"],
             ["H2", f'=IFERROR(ROUND(AVERAGEIFS($B$2:$B${L},$D$2:$D${L},F2),0),"")', "down"]])
    # T3
    pre = [["applicant_id", "credit_score", "monthly_income", "worst_dpd", None, "product_id", "product", "eligible_applicants"]]
    for i, a in enumerate(apps):
        row = [a[0], a[3], a[1], worst.get(a[0], 0), None]
        if i < 4: row += [i + 1]
        pre.append(row)
    X[3] = dict(rows=L, ncols=8, rightLimit=8, cols=[7, 8], resRows=[2, 5], ends={"7": 5, "8": 5}, pre=pre,
        sol=[["G2", f"=INDEX({P('B')},F2)", "down"],
             ["H2", f'=COUNTIFS($B$2:$B${L},">="&INDEX({P("C")},F2),$C$2:$C${L},">="&INDEX({P("D")},F2),$D$2:$D${L},"<=90")'
                    f'+INDEX({P("I")},F2)*(COUNTIFS($C$2:$C${L},">="&INDEX({P("D")},F2),$D$2:$D${L},"<=90")'
                    f'-COUNTIFS($B$2:$B${L},">=0",$C$2:$C${L},">="&INDEX({P("D")},F2),$D$2:$D${L},"<=90"))', "down"]])
    # T4
    names = [p[1] for p in products]
    pre = [["applicant_id", "credit_score", "monthly_income", "worst_dpd"] + names + ["recommended", None, "recommended_product", "applicants"]]
    kl = names + ["No offer"]
    for i, a in enumerate(apps):
        row = [a[0], a[3], a[1], worst.get(a[0], 0)] + [None] * 6
        if i < 5: row += [kl[i]]
        pre.append(row)
    m = lambda c: f"INDEX({P(c)},MATCH(E$1,{P('B')},0))"
    X[4] = dict(rows=L, ncols=12, rightLimit=8, cols=[11, 12], resRows=[2, 6], ends={"12": 6}, pre=pre,
        sol=[["E2", f'=IF(AND($D2<=90,$C2>={m("D")},OR($B2>={m("C")},AND($B2="",{m("I")}=1))),1,0)', "both"],
             ["I2", '=IFERROR(INDEX($E$1:$H$1,MATCH(1,E2:H2,0)),"No offer")', "down"],
             ["L2", f"=COUNTIF($I$2:$I${L},K2)", "down"]])
    # T5
    pre = [["applicant_id", "monthly_income", "existing_installments", "requested_amount", "requested_term", "product_id",
            "term", "afford_amount", "capped_amount", "offer", "interest", None, "product_id", "product", "offers", "total_offer", "total_interest"]]
    for i, a in enumerate(apps):
        row = [a[0], a[1], a[2], a[4], a[5], rec.get(a[0], 0)] + [None] * 6
        if i < 4: row += [i + 1]
        pre.append(row)
    X[5] = dict(rows=L, ncols=17, rightLimit=17, cols=[14, 15, 16, 17], resRows=[2, 5], ends={"14": 5, "15": 5, "16": 5, "17": 5}, pre=pre,
        sol=[["G2", f"=IF(F2=0,0,MIN(E2,INDEX({P('F')},F2)))", "down"],
             ["H2", f"=IF(F2=0,0,(INDEX({P('H')},F2)*B2-C2)*G2/(1+INDEX({P('G')},F2)*G2/12))", "down"],
             ["I2", f"=IF(F2=0,0,ROUNDDOWN(MIN(D2,INDEX({P('E')},F2),MAX(H2,0)),-6))", "down"],
             ["J2", "=IF(I2<5000000,0,I2)", "down"],
             ["K2", f"=IF(J2=0,0,ROUND(J2*INDEX({P('G')},F2)*G2/12,0))", "down"],
             ["N2", f"=INDEX({P('B')},M2)", "down"],
             ["O2", f'=COUNTIFS($F$2:$F${L},M2,$J$2:$J${L},">0")', "down"],
             ["P2", f"=SUMIFS($J$2:$J${L},$F$2:$F${L},M2)", "down"],
             ["Q2", f"=SUMIFS($K$2:$K${L},$F$2:$F${L},M2)", "down"]])
    return X
