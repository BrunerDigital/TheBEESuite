"use client";

import { useRef } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { revealFocusedTeacherChildPicker } from "@/lib/teacher-child-picker-focus";
import styles from "./teacher-report-targets.module.css";

type ChildChoice = { id: string; fullName: string; ageGroup: string };
type ChildGroup = { id: string | null; name: string; children: ChildChoice[] };

/** One controlled view of the existing shared individual-task child; no local target state. */
export function TeacherChildPicker({ id, label, groups, selectedChildId, disabled, onChildChange }: {
  id: string;
  label: string;
  groups: ChildGroup[];
  selectedChildId: string;
  disabled: boolean;
  onChildChange: (childId: string) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const children = groups.flatMap(group => group.children);
  const selected = children.find(child => child.id === selectedChildId);
  return (
    <div className="space-y-1" data-teacher-child-picker>
      <Label htmlFor={id}>{label}</Label>
      <Select disabled={disabled || !children.length} value={selected?.id ?? ""} onValueChange={value => {
        if (!disabled && typeof value === "string" && children.some(child => child.id === value)) onChildChange(value);
      }} onOpenChangeComplete={open => {
        if (!open) requestAnimationFrame(() => requestAnimationFrame(() => revealFocusedTeacherChildPicker(triggerRef.current)));
      }}>
        <SelectTrigger ref={triggerRef} id={id} aria-describedby={`${id}-hint`} className={styles.picker}>
          <SelectValue placeholder="Choose a current child">{selected?.fullName}</SelectValue>
        </SelectTrigger>
        <SelectContent align="start" className={styles.options}>
          {groups.map(group => <SelectGroup key={group.id ?? "unassigned"}>
            <SelectLabel>{group.name}</SelectLabel>
            {group.children.map(child => <SelectItem key={child.id} value={child.id} aria-label={`${child.fullName} · ${child.ageGroup}`}>
              <span className={styles.optionText}><span>{child.fullName}</span><span className="text-xs text-muted-foreground">{child.ageGroup}</span></span>
            </SelectItem>)}
          </SelectGroup>)}
        </SelectContent>
      </Select>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {children.length ? "Shared child for Photo, Incident and Location." : "No children are on your roster. Ask your school office to confirm your classroom."}
      </p>
    </div>
  );
}
