"use client"

import * as Select from "@radix-ui/react-select"
import { Fragment } from "react"
import { Check, ChevronDown, type LucideIcon } from "lucide-react"

type OptionGroup = {
  label?: string
  options: { value: string; label: string }[]
}

type RegistrationSelectProps = {
  id: string
  value: string
  placeholder: string
  icon: LucideIcon
  groups: OptionGroup[]
  onValueChange: (value: string) => void
}

export function RegistrationSelect({ id, value, placeholder, icon: Icon, groups, onValueChange }: RegistrationSelectProps) {
  return (
    <Select.Root value={value} onValueChange={onValueChange} required>
      <Select.Trigger
        id={id}
        className="group flex h-12 w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-left text-sm text-slate-900 transition hover:border-slate-300 hover:bg-slate-50 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/15 data-[placeholder]:text-slate-400 data-[state=open]:border-blue-500 data-[state=open]:bg-white data-[state=open]:ring-2 data-[state=open]:ring-blue-500/15"
      >
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-focus:text-blue-600 group-data-[state=open]:text-blue-600" />
        <span className="min-w-0 flex-1 truncate"><Select.Value placeholder={placeholder} /></span>
        <Select.Icon asChild>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-data-[state=open]:rotate-180 group-data-[state=open]:text-blue-600" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          className="z-50 max-h-[min(360px,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 text-slate-900 shadow-[0_12px_40px_-8px_rgba(15,23,42,0.18)]"
        >
          <Select.Viewport className="overscroll-contain">
            {groups.map((group, index) => (
              <Select.Group key={group.label ?? index}>
                {index > 0 && <Select.Separator className="mx-2 my-1.5 h-px bg-slate-100" />}
                {group.label && <Select.Label className="px-3 pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group.label}</Select.Label>}
                {group.options.map((option, optionIndex) => (
                  <Fragment key={option.value}>
                    {optionIndex > 0 && <Select.Separator className="mx-3 my-1 h-px shrink-0 bg-slate-200/70" />}
                    <Select.Item
                      value={option.value}
                      className="relative flex min-h-11 cursor-pointer select-none items-center rounded-lg py-2.5 pl-3 pr-9 text-sm leading-5 outline-none data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:font-medium data-[state=checked]:text-blue-700"
                    >
                      <Select.ItemText>{option.label}</Select.ItemText>
                      <Select.ItemIndicator className="absolute right-3 flex items-center text-blue-600"><Check className="h-4 w-4" /></Select.ItemIndicator>
                    </Select.Item>
                  </Fragment>
                ))}
              </Select.Group>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}
