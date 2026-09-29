from __future__ import annotations

import os
import sys

from scripts.acceptance.common import (
    AcceptanceFailure,
    SafeHttpClient,
    generate_load_id,
)


def main() -> int:
    base_url = os.environ.get("FREIGHTBRIDGE_BASE_URL", "")
    token = os.environ.get("OPERATIONS_API_BEARER_TOKEN", "")

    if not base_url or not token:
        print("Missing FREIGHTBRIDGE_BASE_URL or OPERATIONS_API_BEARER_TOKEN.")
        return 1

    client = SafeHttpClient(
        name="FreightBridge",
        base_url=base_url,
        verbose=True,
    )

    try:
        load_id = generate_load_id()

        print("Milestone 27 Mission 7 direct recovery diagnostic")
        print(f"load_id={load_id}")

        created = client.post_json(
            "/api/lab/runs",
            {
                "scenarioKey": "X12_214_UNSUPPORTED_STATUS",
                "loadId": load_id,
                "equipmentType": "VAN_53",
                "weightLbs": 42000,
                "pieces": 22,
                "commodityDescription": "Mission 7 Recovery Diagnostic",
            },
            token=token,
            expected=(201,),
            step="Create Mission 7 diagnostic run",
        )

        run_id = str(created.get("id") or "")
        if not run_id:
            raise AcceptanceFailure(
                "Create Mission 7 diagnostic run",
                "Lab run response did not include an id.",
                response_body=created,
            )

        print(f"run_id={run_id}")
        current = created

        for attempt in range(1, 5):
            status = str(current.get("status") or "")
            print(f"fault_run_status_before_{attempt}={status}")

            if status in ("SUCCEEDED", "FAILED"):
                break

            result = client.post_empty(
                f"/api/lab/runs/{run_id}/run-next",
                token=token,
                expected=(200,),
                step="Execute Mission 7 controlled failure",
            )

            next_run = result.get("run")
            if not isinstance(next_run, dict):
                raise AcceptanceFailure(
                    "Execute Mission 7 controlled failure",
                    "run-next response did not contain a run.",
                    response_body=result,
                )

            current = next_run

        print(f"fault_run_final_status={current.get('status')}")

        if current.get("status") != "SUCCEEDED":
            raise AcceptanceFailure(
                "Execute Mission 7 controlled failure",
                "Expected failure drill did not complete successfully.",
                response_body={
                    "runId": run_id,
                    "status": current.get("status"),
                    "resultSummary": current.get("resultSummary"),
                },
            )

        print("")
        print("Calling real server-backed recovery...")
        print("")

        recovered = client.post_empty(
            f"/api/lab/runs/{run_id}/recover",
            token=token,
            expected=(200,),
            step="Recover Mission 7 diagnostic run",
        )

        summary = recovered.get("resultSummary")
        recovery = (
            summary.get("recovery")
            if isinstance(summary, dict)
            else None
        )

        print("[PASS] Mission 7 recovery endpoint returned 200")
        print(f"recovery={recovery}")
        return 0

    except AcceptanceFailure as exc:
        print("[FAIL]")
        print(exc.format())
        return 1
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
