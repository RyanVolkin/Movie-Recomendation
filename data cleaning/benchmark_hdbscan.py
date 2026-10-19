import time
import requests
import pandas as pd

BACKEND_URL = "http://localhost:3000/api/movies"

USER_IDS = [
    "80d20df5-1d8a-4eaa-ba85-85df928d7a4b",
  "a3b55332-10a6-4f16-993a-6be5d8652583",
  "7a06e4c9-0df8-47fa-bd13-9781d504d953",
  "8c437e97-38db-4474-8d4a-dca22884e4b4",
  "3a7c49ab-8de7-4157-93e0-657053a36fbc",
  "7a127f91-9239-441b-949b-efacf6864f49",
  "0fdc630b-23c3-4670-a7c9-9ebd03e2cf0c",
  "89f45784-9f05-4a83-ba7d-8aac5884d9e5",
  "5f485a6a-5e2b-481e-9f36-776e03e9efeb",
  "64e53045-5be0-498f-a9c4-0e4159322491",
  "9fec1f6f-6653-4b2e-99f0-3f8c4f8b23ea",
  "6660b5f8-3b92-4fd9-b38b-9bcd2f56069d",
  "4a7c6038-b41d-42cc-8384-09c13edfdee7",
  "f0b061ec-fe6d-4d57-b81a-f74cfcf9b722",
  "16ba442e-64e7-4af8-a434-990dd0886a41",
  "465b7b33-3b43-4ac1-bedd-a5574bb5a3d4",
  "dd6be783-ec95-4780-a3c6-eef2cd8f3cb6",
  "0d55ad48-f7af-4f44-87bc-3e2e235350cb",
  "eeb98a84-e122-4d76-810b-208287beb1d2",
  "b3c63deb-5aed-4060-ba36-b121af35e0a9"
]

REQUESTS_PER_USER = 100


def run_one_request(user_id):
    start_time = time.perf_counter()

    try:
        response = requests.get(f"{BACKEND_URL}/{user_id}/recommend")
        json_data = response.json()

        end_time = time.perf_counter()

        neighbors = json_data.get("neighbors") or []

        return {
            "userId": user_id,
            "status": response.status_code,
            "runtimeMs": (end_time - start_time) * 1000,
            "recommendations": [movie.get("title") for movie in neighbors],
            "error": json_data.get("error"),
        }

    except Exception as e:
        end_time = time.perf_counter()

        return {
            "userId": user_id,
            "status": None,
            "runtimeMs": (end_time - start_time) * 1000,
            "recommendations": [],
            "error": str(e),
        }


def average(values):
    valid = [
        value for value in values
        if isinstance(value, (int, float))
    ]

    if not valid:
        return None

    return sum(valid) / len(valid)


def summarize(results):
    valid = [
        result for result in results
        if result["status"] == 200
    ]

    return {
        "requests": len(results),
        "successfulRequests": len(valid),
        "averageRuntimeMs": average(
            [result["runtimeMs"] for result in valid]
        ),
    }


def main():
    all_results = []

    export_rows = []

    for user_id in USER_IDS:
        print(f"\nTesting user: {user_id}")

        user_results = []

        for i in range(1, REQUESTS_PER_USER + 1):
            result = run_one_request(user_id)

            user_results.append(result)
            all_results.append(result)

            print(
                f"Request {i}: "
                f"Runtime={result['runtimeMs']:.2f}ms"
            )

            if result["error"]:
                print(f"Error: {result['error']}")

        summary = summarize(user_results)
        last_movies = user_results[-1]["recommendations"]

        export_rows.append({
            "userId": user_id,
            "requests": summary["requests"],
            "successfulRequests": summary["successfulRequests"],
            "averageRuntimeMs": summary["averageRuntimeMs"],
            "recommendedMovies": ", ".join(last_movies),
        })

        user_table = pd.DataFrame([{
            "userId": user_id,
            "requests": summary["requests"],
            "successfulRequests": summary["successfulRequests"],
            "averageRuntimeMs": summary["averageRuntimeMs"],
            "recommendedMovies": ", ".join(last_movies),
        }])

        print("\nUser Summary")
        print(user_table.to_string(index=False))

        print("\nRecommended movies from last request:")
        print(
            pd.DataFrame(
                last_movies,
                columns=["recommendedMovies"]
            ).to_string(index=False)
        )

    print("\nFinal Summary")

    final_summary = pd.DataFrame([
        {
            "userId": user_id,
            **summarize([
                result for result in all_results
                if result["userId"] == user_id
            ])
        }
        for user_id in USER_IDS
    ])

    export_df = pd.DataFrame(export_rows)
    export_df.to_csv("runtime_analysis.csv", index=False)

    print("\nSaved results to runtime_analysis.csv")

    print(final_summary.to_string(index=False))


if __name__ == "__main__":
    main()