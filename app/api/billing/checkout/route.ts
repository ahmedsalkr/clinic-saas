export async function POST() {
  return Response.json(
    { error: "Payments are currently disabled." },
    { status: 410 },
  );
}
