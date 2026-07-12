"use client";
import { useState } from "react";
import { FieldLabel, PageHeader } from "@anclora/ui";
import { AppShell } from "../../components/app-shell";
export default function NewExpensePage() {
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("attachment") as File;
    const attachmentBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const body = Object.fromEntries(form);
    delete body.attachment;
    const response = await fetch("/api/v1/expenses", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, attachmentBase64, mimeType: file.type }),
    });
    setMessage(
      response.ok
        ? "Gasto guardado"
        : response.status === 409
          ? "Documento duplicado"
          : "No se pudo guardar",
    );
  }
  return (
    <AppShell>
      <PageHeader
        eyebrow="GASTOS"
        title="Nueva factura recibida"
        backHref="/expenses"
      />
      <form onSubmit={(event) => void submit(event)}>
        {([
          ["supplierName", "Proveedor"],
          ["supplierTaxId", "NIF/VAT"],
          ["documentNumber", "Número"],
          ["issueDate", "Fecha de emisión"],
          ["taxBase", "Base imponible"],
          ["vatAmount", "IVA"],
          ["withholdingAmount", "Retención"],
          ["totalAmount", "Total"],
          ["currency", "Moneda"],
          ["categoryCode", "Categoría"],
          ["description", "Descripción"],
        ] as const).map(([name, label]) => (
          <div key={name}>
            <FieldLabel htmlFor={name} required={name !== "description"}>
              {label}
            </FieldLabel>
            <input
              id={name}
              name={name}
              required={name !== "description"}
              type={
                name === "issueDate"
                  ? "date"
                  : [
                        "taxBase",
                        "vatAmount",
                        "withholdingAmount",
                        "totalAmount",
                      ].includes(name)
                    ? "number"
                    : "text"
              }
              step="0.01"
              defaultValue={
                name === "currency"
                  ? "EUR"
                  : name === "withholdingAmount"
                    ? "0"
                    : ""
              }
            />
          </div>
        ))}
        <FieldLabel htmlFor="attachment" required>
          PDF o imagen
        </FieldLabel>
        <input
          id="attachment"
          name="attachment"
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          required
        />
        <button type="submit">Guardar factura recibida</button>
      </form>
      {message ? <p role="status">{message}</p> : null}
    </AppShell>
  );
}
