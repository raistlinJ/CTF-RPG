const reply = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function gradingCompatible(db, current, next) {
  const changed = next.filter((n) => {
    const old = current.find((c) => c.id === n.id);
    return old && (old.grading || "automatic") !== (n.grading || "automatic");
  });
  for (const c of changed) {
    const row = await db
      .prepare(
        "SELECT 1 AS found FROM solved WHERE challenge=? UNION ALL SELECT 1 AS found FROM written_responses WHERE challenge=? LIMIT 1",
      )
      .bind(c.id, c.id)
      .first();
    if (row)
      throw Error(
        "Answer checking cannot change after answers or grades exist. Create a new challenge ID instead.",
      );
  }
  for (const c of next) {
    if (c.grading !== "manual") {
      if (
        await db
          .prepare(
            "SELECT 1 AS found FROM written_responses WHERE challenge=? LIMIT 1",
          )
          .bind(c.id)
          .first()
      )
        throw Error(
          "A challenge ID with written responses must keep manual grading.",
        );
    } else if (
      await db
        .prepare(
          "SELECT 1 AS found FROM solved LEFT JOIN written_responses ON solved.user=written_responses.user AND solved.challenge=written_responses.challenge WHERE solved.challenge=? AND written_responses.user IS NULL LIMIT 1",
        )
        .bind(c.id)
        .first()
    )
      throw Error(
        "A challenge ID with automatic awards must keep automatic checking.",
      );
  }
}
export async function handleReview(req, { db, user, platformAdmin }) {
  const u = await user(req);
  if (!platformAdmin && u?.role !== "admin")
    return reply({ error: "Administrator access required." }, u ? 403 : 401);
  const url = new URL(req.url),
    status = url.searchParams.get("status") || "pending",
    offset = Number(url.searchParams.get("offset") || 0);
  if (
    !["pending", "graded", "all"].includes(status) ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 1000000
  )
    return reply({ error: "Invalid review filter." }, 400);
  const clause =
    status === "pending"
      ? " WHERE r.grade IS NULL"
      : status === "graded"
        ? " WHERE r.grade IS NOT NULL"
        : "";
  async function list() {
    const total = await db
      .prepare("SELECT COUNT(*) AS n FROM written_responses r" + clause)
      .bind()
      .first();
    const rows = (
      await db
        .prepare(
          "SELECT r.*,s.username FROM written_responses r JOIN students s ON s.id=r.user" +
            clause +
            " ORDER BY r.submitted_at,r.user,r.challenge LIMIT 50 OFFSET ?",
        )
        .bind(offset)
        .all()
    ).results;
    return {
      total: total.n,
      offset,
      limit: 50,
      responses: rows.map((r) => ({
        user: r.user,
        username: r.username,
        team: r.submitted_team,
        challenge: r.challenge,
        answer: r.answer,
        question: r.question,
        object: r.object,
        maxPoints: r.max_points,
        hintCost: r.hint_cost,
        submittedAt: r.submitted_at,
        revision: r.revision,
        grade: r.grade,
        netPoints: r.grade === null ? null : Math.max(0, r.grade - r.hint_cost),
        feedback: r.feedback,
        reviewer: r.reviewer,
        gradedAt: r.graded_at,
      })),
    };
  }
  if (req.method === "GET") return reply(await list());
  if (req.method !== "POST")
    return reply({ error: "Method not allowed." }, 405);
  const {
    user: owner,
    challenge,
    revision,
    grade,
    feedback = "",
  } = await req.json();
  if (
    typeof owner !== "string" ||
    typeof challenge !== "string" ||
    !Number.isInteger(revision) ||
    !Number.isInteger(grade) ||
    typeof feedback !== "string" ||
    feedback.length > 5000
  )
    return reply(
      {
        error:
          "Enter a whole-number grade and feedback of at most 5,000 characters.",
      },
      400,
    );
  const r = await db
    .prepare("SELECT * FROM written_responses WHERE user=? AND challenge=?")
    .bind(owner, challenge)
    .first();
  if (!r) return reply({ error: "Response not found." }, 404);
  if (grade < 0 || grade > r.max_points)
    return reply(
      {
        error: `Choose a grade from 0 to ${r.max_points}. Hint costs are subtracted automatically.`,
      },
      400,
    );
  const results = await db.batch([
    db
      .prepare(
        "UPDATE written_responses SET grade=?,feedback=?,reviewer=?,graded_at=?,revision=revision+1 WHERE user=? AND challenge=? AND revision=?",
      )
      .bind(
        grade,
        feedback,
        u?.username || "Platform administrator",
        Date.now(),
        owner,
        challenge,
        revision,
      ),
    db
      .prepare(
        "INSERT INTO solved(user,challenge,points) SELECT user,challenge,MAX(0,grade-hint_cost) FROM written_responses WHERE user=? AND challenge=? AND revision=? AND changes()=1 ON CONFLICT(user,challenge) DO UPDATE SET points=excluded.points",
      )
      .bind(owner, challenge, revision + 1),
    db.prepare("INSERT OR IGNORE INTO earned_rewards(user,challenge,payload) SELECT user,challenge,rewards_payload FROM written_responses WHERE user=? AND challenge=? AND revision=? AND changes()=1").bind(owner,challenge,revision+1),
  ]);
  if (!(results[0].meta?.changes ?? results[0].changes))
    return reply(
      {
        error:
          "This response changed while you were reviewing it. Refresh before grading.",
      },
      409,
    );
  return reply({ ok: true, ...(await list()) });
}
