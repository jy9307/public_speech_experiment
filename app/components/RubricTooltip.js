"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { rubricCategory, rubricItem, RUBRIC_LEVEL_LABELS } from "../lib/rubric";
export default function RubricTooltip({ categoryId, itemId, telemetry, roundId, screen }) {
  const category = rubricCategory(categoryId),
    item = rubricItem(categoryId, itemId);
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState({ left: 16, top: 0, width: 360 });
  const trigger = useRef(null),
    popup = useRef(null),
    timer = useRef(null);
  const id = useId();
  const emit = telemetry?.emit;
  useEffect(() => {
    if (!open) return;
    const started = performance.now();
    emit?.("rubric_open", { categoryId, rubricItemId: itemId }, null, {roundId,screen});
    return () => emit?.("rubric_close", { categoryId, rubricItemId: itemId, durationMs: Math.round(performance.now()-started) }, null, {roundId,screen});
  }, [open, categoryId, itemId, emit, roundId, screen]);
  function show() {
    clearTimeout(timer.current);
    setOpen(true);
  }
  function hide() {
    timer.current = setTimeout(() => setOpen(false), 120);
  }
  useLayoutEffect(() => {
    if (!open) return;
    const rect = trigger.current.getBoundingClientRect(),
      width = Math.min(400, innerWidth - 32);
    const height = Math.min(
      popup.current?.scrollHeight || 300,
      innerHeight - 32,
    );
    const top =
      rect.bottom + height + 8 <= innerHeight - 16
        ? rect.bottom + 8
        : Math.max(16, rect.top - height - 8);
    setPosition({
      left: Math.max(16, Math.min(rect.left, innerWidth - width - 16)),
      top,
      width,
    });
  }, [open, categoryId, itemId]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (e) => {
      if (
        !trigger.current?.contains(e.target) &&
        !popup.current?.contains(e.target)
      )
        setOpen(false);
    };
    const escape = (e) => {
      if (e.key === "Escape") {
        clearTimeout(timer.current);
        setOpen(false);
      }
    };
    const scroll = (e) => {
      if (!popup.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", scroll);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", scroll);
    };
  }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!category) return null;
  if (!item) return <span>{category.label}</span>;
  const items = [item];
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="rubric-trigger"
        aria-label={`${item?.label || category.label} 루브릭 보기`}
        aria-describedby={open ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={show}
      >
        {item?.label || category.label}
        <span aria-hidden="true"> ⓘ</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={popup}
            id={id}
            role="tooltip"
            className="rubric-tooltip"
            style={position}
            onMouseEnter={show}
            onMouseLeave={hide}
          >
            <p className="rubric-category">{category.label} 평가 기준</p>
            {items.map((criterion) => (
              <section key={criterion.id}>
                <h3>{criterion.label}</h3>
                <p>{criterion.desc}</p>
                <ul className="rubric-level-descriptions">
                  {Object.entries(criterion.levels)
                    .sort(([a], [b]) => Number(b) - Number(a))
                    .map(([level, description]) => (
                      <li key={level}><strong>{RUBRIC_LEVEL_LABELS[level]}</strong><span>{description}</span></li>
                    ))}
                </ul>
              </section>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
