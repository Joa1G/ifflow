import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProcessMetadataForm } from "./process-metadata-form";

const validValues = {
  title: "Solicitação de Capacitação",
  short_description: "Afastamento para estudos.",
  full_description: "Processo completo de pedido de afastamento.",
  category: "RH" as const,
  estimated_time: "30 dias",
  requirements: ["Ser servidor efetivo"],
};

describe("<ProcessMetadataForm />", () => {
  it("submete os valores quando o form está válido", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <ProcessMetadataForm
        onSubmit={onSubmit}
        submitLabel="Criar processo"
      />,
    );

    await user.type(
      screen.getByLabelText(/^Título$/i),
      validValues.title,
    );
    await user.type(
      screen.getByLabelText(/Descrição curta/i),
      validValues.short_description,
    );
    await user.type(
      screen.getByLabelText(/Descrição completa/i),
      validValues.full_description,
    );
    await user.type(
      screen.getByLabelText(/Tempo estimado/i),
      validValues.estimated_time,
    );

    await user.click(screen.getByRole("button", { name: /Criar processo/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: validValues.title,
        short_description: validValues.short_description,
        category: "RH",
      }),
    );
  });

  it("bloqueia submit e mostra mensagem quando título é muito curto", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <ProcessMetadataForm onSubmit={onSubmit} submitLabel="Criar processo" />,
    );

    // Tudo válido exceto o título.
    await user.type(screen.getByLabelText(/^Título$/i), "X");
    await user.type(
      screen.getByLabelText(/Descrição curta/i),
      validValues.short_description,
    );
    await user.type(
      screen.getByLabelText(/Descrição completa/i),
      validValues.full_description,
    );
    await user.type(
      screen.getByLabelText(/Tempo estimado/i),
      validValues.estimated_time,
    );
    await user.click(screen.getByRole("button", { name: /Criar processo/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Título precisa de pelo menos 3 caracteres/i),
    ).toBeInTheDocument();
  });

  it("em modo edit (com defaults) o submit começa desabilitado até haver mudança", () => {
    render(
      <ProcessMetadataForm
        defaultValues={validValues}
        onSubmit={vi.fn()}
        submitLabel="Salvar metadados"
      />,
    );

    expect(
      screen.getByRole("button", { name: /Salvar metadados/i }),
    ).toBeDisabled();
  });

  it("permite adicionar e remover requisitos", async () => {
    const user = userEvent.setup();
    render(
      <ProcessMetadataForm
        defaultValues={validValues}
        onSubmit={vi.fn()}
        submitLabel="Salvar metadados"
      />,
    );

    // Já existe 1 requisito (do validValues). aria-label exato evita
    // matchear o aria-label do botão "Remover requisito 1".
    expect(screen.getByLabelText("Requisito 1")).toHaveValue(
      "Ser servidor efetivo",
    );

    await user.click(
      screen.getByRole("button", { name: /Adicionar requisito/i }),
    );
    expect(screen.getByLabelText("Requisito 2")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Remover requisito 2/i }),
    );
    expect(screen.queryByLabelText("Requisito 2")).not.toBeInTheDocument();
  });
});
