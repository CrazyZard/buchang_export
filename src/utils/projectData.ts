import type { Dictionary, LabelData } from '../types'
import type { TemplateId } from '../templates'

export const PROJECT_FILE_VERSION = 1

export interface ProjectSnapshot {
  version: typeof PROJECT_FILE_VERSION
  savedAt: string
  templateId?: TemplateId
  labelData: LabelData
  selectedLanguages: string[]
  dictionary: Dictionary
}

export function createProjectSnapshot(
  labelData: LabelData,
  selectedLanguages: string[],
  dictionary: Dictionary,
  templateId?: TemplateId,
): ProjectSnapshot {
  return {
    version: PROJECT_FILE_VERSION,
    savedAt: new Date().toISOString(),
    templateId,
    labelData,
    selectedLanguages,
    dictionary,
  }
}

export function exportProjectSnapshot(snapshot: ProjectSnapshot, filename?: string): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename ?? `洗唛项目_${formatFileDate(snapshot.savedAt)}.buchang.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function parseProjectSnapshot(raw: unknown): ProjectSnapshot {
  if (!raw || typeof raw !== 'object') {
    throw new Error('无效的项目文件')
  }

  const data = raw as Partial<ProjectSnapshot>

  if (data.version !== PROJECT_FILE_VERSION) {
    throw new Error(`不支持的项目版本：${String(data.version)}`)
  }

  if (!data.labelData || !data.dictionary) {
    throw new Error('项目文件缺少必要数据')
  }

  const selectedLanguages = Array.isArray(data.selectedLanguages)
    ? data.selectedLanguages.filter((lang): lang is string => typeof lang === 'string')
    : data.dictionary.languages

  return {
    version: PROJECT_FILE_VERSION,
    savedAt: data.savedAt ?? new Date().toISOString(),
    labelData: data.labelData,
    selectedLanguages,
    dictionary: data.dictionary,
  }
}

export async function importProjectFromFile(file: File): Promise<ProjectSnapshot> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('项目文件不是有效的 JSON')
  }
  return parseProjectSnapshot(parsed)
}

export { importProjectFile, exportProjectToExcel } from './projectExcel'

function formatFileDate(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`
}
