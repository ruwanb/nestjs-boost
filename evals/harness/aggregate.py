"""Aggregate an iteration's grading/timing into benchmark.json and a readable summary.

Usage: python3 -I aggregate.py <iteration-dir> <out-benchmark.json>
Configs compared: without_skill (baseline) vs with_skill.
Also classifies every assertion: passes in both (non-discriminating), fails in both
(broken or too hard), passes only with the skill (skill value), or only without (regression).
"""
import json
import pathlib
import statistics
import sys

CONFIGS = ("without_skill", "with_skill")


def stats(values):
    if not values:
        return {"mean": None, "stddev": None, "n": 0}
    return {"mean": round(statistics.mean(values), 3),
            "stddev": round(statistics.pstdev(values), 3) if len(values) > 1 else 0.0,
            "n": len(values)}


def main():
    it = pathlib.Path(sys.argv[1])
    out = pathlib.Path(sys.argv[2])
    per_eval, run_summary = {}, {}
    for cfg in CONFIGS:
        rates, tokens, secs = [], [], []
        for d in sorted(it.glob(f"*/{cfg}")):
            g, t = d / "grading.json", d / "timing.json"
            if not g.exists():
                continue
            grading = json.loads(g.read_text())
            rates.append(grading["summary"]["pass_rate"])
            per_eval.setdefault(d.parent.name, {})[cfg] = {a["text"]: a["passed"] for a in grading["assertion_results"]}
            if t.exists():
                timing = json.loads(t.read_text())
                tokens.append(timing["total_tokens"])
                secs.append(timing["duration_ms"] / 1000)
        run_summary[cfg] = {"pass_rate": stats(rates), "tokens": stats(tokens), "time_seconds": stats(secs)}

    def delta(metric):
        a, b = run_summary["without_skill"][metric]["mean"], run_summary["with_skill"][metric]["mean"]
        return None if a is None or b is None else round(b - a, 3)

    run_summary["delta"] = {m: delta(m) for m in ("pass_rate", "tokens", "time_seconds")}

    classes = {"both_pass": [], "both_fail": [], "skill_only": [], "baseline_only": []}
    for ev, cfgs in sorted(per_eval.items()):
        if len(cfgs) < 2:
            continue
        for text, base in cfgs["without_skill"].items():
            skill = cfgs["with_skill"].get(text)
            if skill is None:
                continue
            key = "both_pass" if base and skill else "both_fail" if not base and not skill else "skill_only" if skill else "baseline_only"
            classes[key].append(f"{ev}: {text}")

    per_eval_rates = {ev: {cfg: round(sum(v.values()) / len(v), 3) for cfg, v in cfgs.items()} for ev, cfgs in per_eval.items()}
    bench = {"run_summary": run_summary, "per_eval_pass_rate": per_eval_rates,
             "assertion_classes": {k: v for k, v in classes.items()},
             "assertion_class_counts": {k: len(v) for k, v in classes.items()}}
    out.write_text(json.dumps(bench, indent=2))

    rs = run_summary
    print(f"pass rate  baseline {rs['without_skill']['pass_rate']['mean']}  with skill {rs['with_skill']['pass_rate']['mean']}  delta {rs['delta']['pass_rate']}")
    print(f"tokens     baseline {rs['without_skill']['tokens']['mean']}  with skill {rs['with_skill']['tokens']['mean']}  delta {rs['delta']['tokens']}")
    print(f"time (s)   baseline {rs['without_skill']['time_seconds']['mean']}  with skill {rs['with_skill']['time_seconds']['mean']}  delta {rs['delta']['time_seconds']}")
    print("assertions:", bench["assertion_class_counts"])
    for k in ("skill_only", "baseline_only", "both_fail"):
        for item in classes[k]:
            print(f"  [{k}] {item}")


if __name__ == "__main__":
    main()
