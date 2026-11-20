// Пример для проверки интерфейса до появления ключей Supabase.
// 21 штука, 20 000 ₽ выручки, прибыль 10% = 2 000 ₽.
window.LLV_DEMO = {
  workers: [
    { id: "w-maria", name: "Мария Котова", created_at: "2026-11-01T08:00:00Z" },
    { id: "w-artem", name: "Артём Лебедев", created_at: "2026-11-01T08:00:00Z" },
    { id: "w-nika", name: "Ника Орлова", created_at: "2026-11-01T08:00:00Z" }
  ],
  shifts: [
    {
      id: "s-maria-1",
      worker_id: "w-maria",
      started_at: "2026-11-19T07:00:00Z",
      ended_at: "2026-11-19T15:00:00Z"
    },
    {
      id: "s-maria-2",
      worker_id: "w-maria",
      started_at: "2026-11-20T06:00:00Z",
      ended_at: null
    },
    {
      id: "s-artem-1",
      worker_id: "w-artem",
      started_at: "2026-11-18T08:00:00Z",
      ended_at: "2026-11-18T16:00:00Z"
    },
    {
      id: "s-nika-1",
      worker_id: "w-nika",
      started_at: "2026-11-17T09:00:00Z",
      ended_at: "2026-11-17T17:00:00Z"
    }
  ],
  sales: [
    { id: "sale-1", worker_id: "w-maria", shift_id: "s-maria-1", count: 3, amount_rub: 4500, sold_at: "2026-11-19T09:10:00Z" },
    { id: "sale-2", worker_id: "w-maria", shift_id: "s-maria-1", count: 1, amount_rub: 1500, sold_at: "2026-11-19T12:40:00Z" },
    { id: "sale-3", worker_id: "w-maria", shift_id: "s-maria-2", count: 2, amount_rub: 1500, sold_at: "2026-11-20T08:05:00Z" },
    { id: "sale-4", worker_id: "w-artem", shift_id: "s-artem-1", count: 10, amount_rub: 10000, sold_at: "2026-11-18T11:20:00Z" },
    { id: "sale-5", worker_id: "w-nika", shift_id: "s-nika-1", count: 5, amount_rub: 2500, sold_at: "2026-11-17T13:00:00Z" }
  ]
};
