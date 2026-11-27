// @vitest-environment jsdom
// Draft of the test for the shared card picture (issue 1989, US-QS-32). The final file lives next to the component.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CardPicture } from "./card-picture";

afterEach(cleanup);

describe("US-QS-32 · SG-PHOTO-01 the card picture has a 4:3 box, and its room is reserved before the picture loads", () => {
  it("US-QS-32 · SG-PHOTO-01 the picture sits in a 4:3 box (aspect-[4/3]) that hides what overflows, and the image covers it", () => {
    const { container } = render(
      <CardPicture src="https://upload.wikimedia.org/a.jpg" alt="Bild von Aloe vera" />,
    );
    const figure = container.querySelector("figure") as HTMLElement;
    const box = figure.firstElementChild as HTMLElement;
    expect(box.className).toContain("aspect-[4/3]");
    expect(box.className).toContain("w-full");
    expect(box.className).toContain("overflow-hidden");
    const img = screen.getByRole("img", { name: "Bild von Aloe vera" });
    expect(box.contains(img)).toBe(true);
    expect(img.className).toContain("object-cover");
    expect(img.className).toContain("size-full");
    expect(img.getAttribute("loading")).toBe("lazy");
  });
});

describe("US-QS-32 · SG-PHOTO-01 the box is the full width of the card and no height cap shrinks it (issue 2383, issue 2421)", () => {
  it("US-QS-32 · SG-PHOTO-01 the box takes the whole width of its card and has no width derived from the window height", () => {
    const { container } = render(<CardPicture src="https://example.org/a.jpg" alt="Bild" />);
    const box = container.querySelector("figure")?.firstElementChild as HTMLElement;
    expect(box.className).toContain("w-full");
    expect(box.className).not.toMatch(/dvh|vh|mx-auto|min\(/);
  });
});

describe("US-QS-32 · SG-PHOTO-01 the 4:3 box keeps its ratio when the card is short of room", () => {
  it("US-QS-32 · SG-PHOTO-01 the box does not shrink (shrink-0), so the picture keeps 4:3 at every card height and text size", () => {
    const { container } = render(<CardPicture src="https://example.org/a.jpg" alt="Bild" />);
    const box = container.querySelector("figure")?.firstElementChild as HTMLElement;
    const classes = box.className.split(" ");
    expect(classes).toContain("aspect-[4/3]");
    expect(classes).toContain("shrink-0");
    expect(classes).not.toContain("shrink");
    expect(box.className).not.toContain("min-h-");
  });
});

describe("US-QS-32 · SG-PHOTO-02 a missing or failed picture shows the drawn placeholder in the same box", () => {
  it("US-QS-32 · SG-PHOTO-02 without a picture address the drawn sprout stands in: no image, no emoji, the box keeps its 4:3 room", () => {
    const { container } = render(<CardPicture src={null} alt="Bild von Aloe vera" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).not.toContain("🌱");
    expect(
      (container.querySelector("figure")?.firstElementChild as HTMLElement).className,
    ).toContain("aspect-[4/3]");
  });

  it("US-QS-32 · SG-PHOTO-02 a picture that fails to load turns into the same drawn placeholder", () => {
    const { container } = render(
      <CardPicture src="https://example.org/broken.jpg" alt="Bild von Aloe vera" />,
    );
    fireEvent.error(screen.getByRole("img", { name: "Bild von Aloe vera" }));
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("US-QS-32 · SG-PHOTO-02 a new address after a failed one is shown, the failure does not stick to the card", () => {
    const { container, rerender } = render(
      <CardPicture src="https://example.org/a.jpg" alt="Bild" />,
    );
    fireEvent.error(screen.getByRole("img", { name: "Bild" }));
    rerender(<CardPicture src="https://example.org/b.jpg" alt="Bild" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://example.org/b.jpg");
  });
});

describe("US-QS-32 · SG-PHOTO-03 the credit sits directly under the picture, in secondary text", () => {
  it("US-QS-32 · SG-PHOTO-03 the credit is a figcaption right after the picture box, and it keeps its link", () => {
    const { container } = render(
      <CardPicture
        src="https://upload.wikimedia.org/a.jpg"
        alt="Bild von Aloe vera"
        credit={
          <a href="https://de.wikipedia.org/wiki/Aloe_vera">Bild und Text: Wikipedia (CC BY-SA)</a>
        }
      />,
    );
    const figure = container.querySelector("figure") as HTMLElement;
    const caption = figure.querySelector("figcaption");
    expect(caption).not.toBeNull();
    expect(caption?.previousElementSibling).toBe(figure.firstElementChild);
    expect(caption?.className).toContain("text-muted-foreground");
    expect(caption?.className).toContain("text-sm");
    expect(screen.getByRole("link", { name: "Bild und Text: Wikipedia (CC BY-SA)" })).toBeTruthy();
  });

  it("US-QS-32 · SG-PHOTO-03 without a credit there is no caption at all", () => {
    const { container } = render(<CardPicture src={null} alt="Bild" />);
    expect(container.querySelector("figcaption")).toBeNull();
  });
});
