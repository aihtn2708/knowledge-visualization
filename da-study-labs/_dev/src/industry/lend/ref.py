import sys, json, warnings, numpy as np, pandas as pd
warnings.filterwarnings("ignore")
sys.path.insert(0, "/tmp/sc_dl/scorecardpy-0.1.9.7")
import scorecardpy as sc
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
dat = sc.germancredit()
dat["creditability"] = (dat["creditability"] == "bad").astype(int)   # 1 = bad
# follow the scorecardpy README example
dt_s = sc.var_filter(dat, y="creditability")
train, test = sc.split_df(dt_s, "creditability").values()
bins = sc.woebin(dt_s, y="creditability")
iv_all = sc.iv(dat, y="creditability")
train_woe = sc.woebin_ply(train, bins); test_woe = sc.woebin_ply(test, bins)
y_tr = train_woe.loc[:, "creditability"]; X_tr = train_woe.loc[:, train_woe.columns != "creditability"]
y_te = test_woe.loc[:, "creditability"]; X_te = test_woe.loc[:, train_woe.columns != "creditability"]
lr = LogisticRegression(penalty="l1", C=0.9, solver="saga", n_jobs=-1, max_iter=5000, random_state=0)
lr.fit(X_tr, y_tr)
p_te = lr.predict_proba(X_te)[:, 1]; p_tr = lr.predict_proba(X_tr)[:, 1]
print("vars kept", list(X_tr.columns)); print("AUC train", round(roc_auc_score(y_tr, p_tr), 4), "test", round(roc_auc_score(y_te, p_te), 4))
card = sc.scorecard(bins, lr, X_tr.columns)   # points0=600, odds0=1/19, pdo=50
tr_score = sc.scorecard_ply(train, card, print_step=0); te_score = sc.scorecard_ply(test, card, print_step=0)
perf = sc.perf_eva(y_te, p_te, title="test", show_plot=False)
print("test KS", perf["KS"], "Gini", perf["Gini"])
print("train", len(train), "test", len(test), "bad rate", round(dat.creditability.mean(), 3))
print(iv_all.head(25).to_string())
out = {"iv": iv_all.values.tolist(), "card": {}, "bins": {}, "test": {"score": te_score.score.astype(int).tolist(), "bad": y_te.astype(int).tolist()},
       "train": {"score": tr_score.score.astype(int).tolist(), "bad": y_tr.astype(int).tolist()},
       "auc": [roc_auc_score(y_tr, p_tr), roc_auc_score(y_te, p_te)], "ks": perf["KS"], "gini": perf["Gini"], "kept": list(X_tr.columns)}
for k, v in card.items():
    out["card"][k] = v[["variable", "bin", "points"]].values.tolist()
for k, v in bins.items():
    out["bins"][k] = v[["variable", "bin", "count", "good", "bad", "badprob", "woe", "bin_iv", "total_iv"]].values.tolist()
json.dump(out, open("ref.json", "w"), default=float)
print(card["basepoints"])
