import { WASH_LABEL_TEMPLATES, type TemplateId } from '../templates'

interface HomePageProps {
  onSelectTemplate: (id: TemplateId) => void
}

export function HomePage({ onSelectTemplate }: HomePageProps) {
  return (
    <div className="home-page">
      <main className="home-page-main">
        <h1 className="home-brand">步昌</h1>
        <p className="home-subtitle">洗唛排版系统</p>

        <div className="template-list">
          {WASH_LABEL_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              className="template-card"
              onClick={() => onSelectTemplate(template.id)}
            >
              <span className="template-card-title">{template.title}</span>
              <span className="template-card-desc">{template.description}</span>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
