from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.section import WD_SECTION
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from pathlib import Path

OUT = Path(r"C:\Users\ADMIN\Documents\ChatGPT\OHO CRM\outputs\OHO_CRM_User_Manual.docx")
OUT.parent.mkdir(parents=True, exist_ok=True)
IMG = {
    "home": Path(r"C:\Users\ADMIN\AppData\Local\Temp\codex-clipboard-1db962d1-5217-4e88-9d5d-57a96e22c11f.png"),
    "tasks": Path(r"C:\Users\ADMIN\AppData\Local\Temp\codex-clipboard-ad13b731-bb68-4fd9-be8b-29ec55c95c63.png"),
    "journey": Path(r"C:\Users\ADMIN\AppData\Local\Temp\codex-clipboard-9a790c72-c5a8-41c4-9dca-b951de9cbbdd.png"),
    "timeline": Path(r"C:\Users\ADMIN\AppData\Local\Temp\codex-clipboard-d81c81b2-c335-43b7-ada4-fb2251cd1e13.png"),
    "proposal": Path(r"C:\Users\ADMIN\AppData\Local\Temp\codex-clipboard-be515d8e-4df3-4cee-8505-fb4727e0aa64.png"),
    "participants": Path(r"C:\Users\ADMIN\AppData\Local\Temp\codex-clipboard-0c8bd8d7-c4b1-40a3-98bc-fc03f33c0923.png"),
    "home_tasks": Path(r"C:\Users\ADMIN\AppData\Local\Temp\codex-clipboard-283bc6e9-d36d-4b0f-bcc5-64e2107f3413.png"),
}

doc = Document()
sec = doc.sections[0]
sec.top_margin = Inches(0.72); sec.bottom_margin = Inches(0.7)
sec.left_margin = Inches(0.78); sec.right_margin = Inches(0.78)

styles = doc.styles
styles['Normal'].font.name = 'Aptos'; styles['Normal'].font.size = Pt(10.5)
styles['Normal'].paragraph_format.space_after = Pt(6)
styles['Normal'].paragraph_format.line_spacing = 1.12
for s, size in [('Title', 30), ('Heading 1', 20), ('Heading 2', 14), ('Heading 3', 11.5)]:
    st = styles[s]; st.font.name = 'Aptos Display' if s != 'Normal' else 'Aptos'; st.font.size = Pt(size); st.font.color.rgb = RGBColor(0,0,0)
    st.font.bold = True
title_ppr = styles['Title']._element.get_or_add_pPr()
title_border = title_ppr.find(qn('w:pBdr'))
if title_border is not None:
    title_ppr.remove(title_border)
styles['Heading 1'].paragraph_format.space_before = Pt(12); styles['Heading 1'].paragraph_format.space_after = Pt(8)
styles['Heading 2'].paragraph_format.space_before = Pt(10); styles['Heading 2'].paragraph_format.space_after = Pt(5)
styles['Heading 3'].paragraph_format.space_before = Pt(7); styles['Heading 3'].paragraph_format.space_after = Pt(4)

TEAL = '137F75'; NAVY = '17323C'; PALE = 'EEF6F4'; BORDER = 'D9E2E6'; GRAY = 'F5F7F8'

def shade(cell, fill):
    tcPr = cell._tc.get_or_add_tcPr(); shd = tcPr.find(qn('w:shd'))
    if shd is None: shd = OxmlElement('w:shd'); tcPr.append(shd)
    shd.set(qn('w:fill'), fill)

def set_cell_margins(cell, top=110, start=120, bottom=110, end=120):
    tc = cell._tc; tcPr = tc.get_or_add_tcPr(); tcMar = tcPr.first_child_found_in('w:tcMar')
    if tcMar is None: tcMar = OxmlElement('w:tcMar'); tcPr.append(tcMar)
    for m,v in [('top',top),('start',start),('bottom',bottom),('end',end)]:
        node = tcMar.find(qn('w:'+m))
        if node is None: node = OxmlElement('w:'+m); tcMar.append(node)
        node.set(qn('w:w'), str(v)); node.set(qn('w:type'),'dxa')

def set_repeat_table_header(row):
    trPr = row._tr.get_or_add_trPr(); tblHeader = OxmlElement('w:tblHeader'); tblHeader.set(qn('w:val'),'true'); trPr.append(tblHeader)

def table(headers, rows, widths=None):
    t = doc.add_table(rows=1, cols=len(headers)); t.alignment = WD_TABLE_ALIGNMENT.CENTER; t.autofit = False
    for i,h in enumerate(headers):
        c=t.rows[0].cells[i]; c.text=str(h); shade(c,NAVY); set_cell_margins(c); c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
        for r in c.paragraphs[0].runs: r.font.bold=True; r.font.color.rgb=RGBColor(255,255,255); r.font.size=Pt(9)
    set_repeat_table_header(t.rows[0])
    for ri,row in enumerate(rows):
        cells=t.add_row().cells
        for i,val in enumerate(row):
            cells[i].text=str(val); set_cell_margins(cells[i]); cells[i].vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
            if ri%2: shade(cells[i],GRAY)
            for p in cells[i].paragraphs:
                p.paragraph_format.space_after=Pt(0)
                for r in p.runs: r.font.size=Pt(8.8)
    if widths:
        for row in t.rows:
            for i,w in enumerate(widths): row.cells[i].width=Inches(w)
    p=doc.add_paragraph(); p.paragraph_format.space_after=Pt(3)
    return t

def bullet(text, level=0):
    p=doc.add_paragraph(style='List Bullet' if level==0 else 'List Bullet 2'); p.add_run(text); return p

def number(text):
    p=doc.add_paragraph(style='List Number'); p.add_run(text); return p

def lead(label, text):
    p=doc.add_paragraph(); r=p.add_run(label+' '); r.bold=True; p.add_run(text); return p

def figure(key, caption, width=6.75):
    if not IMG[key].exists(): return
    p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.keep_with_next=True
    p.add_run().add_picture(str(IMG[key]), width=Inches(width))
    c=doc.add_paragraph(caption); c.alignment=WD_ALIGN_PARAGRAPH.CENTER; c.paragraph_format.space_after=Pt(9)
    for r in c.runs: r.italic=True; r.font.size=Pt(8.5); r.font.color.rgb=RGBColor(90,105,112)

def page(): doc.add_page_break()

def field(run, instr):
    begin=OxmlElement('w:fldChar'); begin.set(qn('w:fldCharType'),'begin')
    ins=OxmlElement('w:instrText'); ins.set(qn('xml:space'),'preserve'); ins.text=instr
    sep=OxmlElement('w:fldChar'); sep.set(qn('w:fldCharType'),'separate')
    end=OxmlElement('w:fldChar'); end.set(qn('w:fldCharType'),'end')
    run._r.extend([begin,ins,sep,end])

# Cover
p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.space_before=Pt(78)
r=p.add_run('OHO'); r.bold=True; r.font.name='Aptos Display'; r.font.size=Pt(38); r.font.color.rgb=RGBColor(19,127,117)
p=doc.add_paragraph('SOLUTIONS'); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
for r in p.runs: r.font.bold=True; r.font.size=Pt(11); r.font.letter_spacing if False else None
p=doc.add_paragraph(style='Title'); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.space_before=Pt(55); p.add_run('OHO CRM User Manual')
p=doc.add_paragraph('Customer operations from lead intake to accepted opportunity'); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
for r in p.runs: r.font.size=Pt(14); r.font.color.rgb=RGBColor(75,91,98)
p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.space_before=Pt(60)
p.add_run('Version 1.0\n').bold=True; p.add_run('Development environment\n4 November 2026\nIndia Standard Time')
p=doc.add_paragraph(); p.paragraph_format.space_before=Pt(80); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
p.add_run('Audience  CRM users managers and administrators').italic=True
page()

doc.add_heading('About this manual', level=1)
doc.add_paragraph('This manual explains how OHO Solutions employees use OHO CRM to manage customer enquiries, leads, follow-ups, meetings, opportunities, proposals, invoices, implementation records, and administrative access. It describes the current development application and the operating rules that protect data quality and reporting accuracy.')
lead('Important.', 'The application uses an approved email address as the user identity. There is no password in the current development phase. Do not share an active user email or use another employee’s identity.')
lead('Environment.', 'The screenshots are illustrative and may contain training records. Production deployment is not covered. Dates and times are handled in India Standard Time unless the screen explicitly states otherwise.')
table(['Document item','Value'],[
    ['Owner','OHO Solutions'],['Application','OHO CRM'],['Document version','1.0'],['Last updated','4 November 2026'],['Scope','End-user and administrator operation'],['Excluded feature','Voice calling'],
],[2.0,4.7])
doc.add_heading('How to use this manual', level=2)
bullet('New users should read Getting started, Home, Leads, Follow-ups, and Opportunities in order.')
bullet('Experienced users can use the Quick reference section for mandatory fields and stage rules.')
bullet('Administrators should also read Administration, Integrations, and Troubleshooting.')

doc.add_heading('Contents', level=1)
contents=[
('1','Getting started'),('2','Home and daily work'),('3','Lead management'),('4','Lead stages and transitions'),('5','Lead detail tabs'),('6','Follow-ups tasks and meetings'),('7','Enquiries and duplicate leads'),('8','Companies and contacts'),('9','Opportunity management'),('10','Proposals and revisions'),('11','Activities invoices and implementation'),('12','Overview dashboards and reporting'),('13','Administration and permissions'),('14','Imports integrations and errors'),('15','Data quality and operating standards'),('16','Troubleshooting'),('17','Quick reference')]
table(['Section','Topic'],contents,[0.8,5.9])
page()

doc.add_heading('1 Getting started', level=1)
doc.add_heading('1.1 Sign in', level=2)
number('Open the OHO CRM development URL supplied by the administrator.')
number('Enter your active CRM user email address.')
number('Select Continue or Sign in. The application opens the Home page for that user.')
lead('If access is refused.', 'The message “This email is not an active CRM user” means an administrator must add or reactivate the user. Check spelling before contacting the administrator.')
doc.add_heading('1.2 Navigation', level=2)
table(['Area','Purpose'],[
['Home','Personal work queue, today’s records, open leads, and open opportunities.'],['Overview','Conversion funnel, pipeline, stage timing, and comparison reporting.'],['Follow-ups','Pending work across leads, opportunities, and activities.'],['Companies and Contacts','B2B account and employee master data.'],['Leads','Lead intake, qualification, discovery, follow-up, and conversion.'],['Enquiries','Repeated enquiries linked to an existing lead.'],['Integration Errors','Failures from Zoho CRM and other connected services.'],['Opportunities','Solution planning, proposals, negotiation, acceptance, and loss.'],['Activities','Meetings and other scheduled or completed work.'],['Proposals','Proposal revisions and accepted version.'],['Invoices and Implementation','Commercial and delivery records.'],['Administration','Users, roles, profiles, permissions, and audit review.'],
],[1.8,4.9])
lead('Refresh records.', 'Use the refresh control when another user has changed data or when the application reports that a record changed. Avoid repeatedly refreshing while a save is in progress.')

doc.add_heading('2 Home and daily work', level=1)
doc.add_paragraph('Home is the employee’s starting point. It is designed so users can complete routine work without opening several modules first.')
figure('home','Figure 1  Personal home page with tasks and newly assigned records',6.75)
table(['Section','What it shows','Recommended action'],[
['My follow-up tasks','Pending tasks and meetings for today or a selected date range.','Open the linked record, complete the activity, or use Close with an outcome note.'],['Leads added or assigned today','Leads created today or assigned to the signed-in user today.','Review and take the first valid stage action.'],['New opportunities today','Opportunities created or assigned today.','Confirm scope, owner, and next action.'],['Open leads','Active assigned leads excluding terminal outcomes.','Use as the working backlog.'],['Open opportunities','Active assigned deals excluding closed loss.','Progress proposals, negotiations, and acceptance.'],
],[1.45,2.8,2.35])
doc.add_heading('2.1 Date filters', level=2)
number('Choose From and To dates. Today is the default.')
number('Select Apply. Changing a date alone does not refresh the table.')
number('Open a task or record by selecting its row. The related detail panel opens without leaving the workspace.')
figure('home_tasks','Figure 2  Compact task table with linked record names',6.75)
page()

doc.add_heading('3 Lead management', level=1)
doc.add_heading('3.1 Lead list views', level=2)
doc.add_paragraph('The default view is Active Leads. Converted and terminal leads are available through saved or filtered views. Stage colors provide quick visual separation, and repeated-enquiry tags are visible in list and detail views.')
bullet('Search by lead, company, phone, or other displayed information.')
bullet('Use multiple criteria when filtering large lead volumes.')
bullet('Select a row anywhere to open the lead detail panel.')
bullet('Follow-up dates and actions remain visible in the list so overdue work can be identified without opening each record.')
doc.add_heading('3.2 Create a lead', level=2)
table(['Field','Requirement','Guideline'],[
['Lead name','Required','Use the person’s name or a clear business enquiry name.'],['Phone','Required and validated','Use a reachable number. The phone is also used for duplicate detection.'],['Lead source','Required for accurate reporting','Choose the actual acquisition channel.'],['Received date','Required','Use the date the enquiry first arrived.'],['Company name','Optional until conversion','Enter the known B2B company name; linking occurs later.'],['Email','Optional','Use a valid business email when available.'],['Customer requirements','Required','Summarize the customer’s stated need in plain language.'],['Owner','Required','Assign the employee responsible for the next action.'],
],[1.7,1.6,3.3])
lead('Do not create duplicate leads manually.', 'When the same phone number is received again, the system applies the enquiry logic described in Section 7.')

doc.add_heading('3.3 Edit and delete controls', level=2)
doc.add_paragraph('Open the three-dot menu in the upper-right of the detail panel to edit or delete a record. Deletion is permission-controlled and should be used only for confirmed test or erroneous records. Operational outcomes should use Junk Lead, Lead Lost, or Closed lost instead of deletion.')

doc.add_heading('4 Lead stages and transitions', level=1)
doc.add_paragraph('Lead movement is controlled by stage-path logic. Only permitted next stages are active; invalid, backward, or skipped movements are disabled. A stage change does not happen automatically after a task animation or meeting update.')
figure('journey','Figure 3  Lead journey with valid next stages and terminal outcomes',3.95)
table(['Current stage','Permitted next stages'],[
['New Lead','Not Contacted; Not Pitched; Discovery to be Scheduled'],['Not Contacted','Not Pitched; Discovery to be Scheduled; Followup Later; Junk Lead; Lead Lost'],['Not Pitched','Discovery to be Scheduled; Followup Later; Junk Lead; Lead Lost'],['Followup Later','Not Contacted; Not Pitched; Discovery to be Scheduled; Junk Lead; Lead Lost'],['Discovery to be Scheduled','Discovery scheduled; Followup Later; Junk Lead; Lead Lost'],['Discovery scheduled','Discovery completed; Junk Lead; Lead Lost'],['Discovery completed','Converted; Junk Lead; Lead Lost'],['Converted Junk Lead Lead Lost','No further lead-stage movement'],
],[2.2,4.5])
doc.add_heading('4.1 Information requested during transitions', level=2)
table(['Target stage','Required information'],[
['Not Contacted','Contact method, attempt date, outcome, stage note, and follow-up task.'],['Not Pitched','Contact method, attempt date, stage note, and follow-up task.'],['Followup Later','Stage note and follow-up date, time, and action when follow-up is selected.'],['Discovery to be Scheduled','Contact method, context note, and next follow-up until the meeting is fixed.'],['Discovery scheduled','Meeting date and time, Online or Offline mode, and meeting link or location.'],['Discovery completed','Discovery findings, confirmed requirements, and suggested solution or products.'],['Junk Lead or Lead Lost','Reason for not proceeding and supporting note.'],['Converted','Existing or new company and contact, with uniqueness checks.'],
],[2.05,4.65])
lead('Open-task decision.', 'When a stage changes, choose whether open tasks should be closed. If Yes is selected, the modal shows a compact table so individual tasks can be selected. Unselected tasks remain open.')
lead('Three attempts.', 'Three follow-up attempts in Not Contacted add the tag #3AttemptsCompleted to the lead.')
lead('New Lead restriction.', 'The Add follow-up action is disabled while a record remains in New Lead. Move it to a working stage first.')
page()

doc.add_heading('5 Lead detail tabs', level=1)
table(['Tab','Use'],[
['Tasks and details','Add notes, schedule follow-ups or meetings, close pending work, and review record information.'],['Timeline','Read notes and follow-up activity in chronological order.'],['History','Review who created or edited the record, field changes, stage changes, tasks, and meetings.'],['Related','View linked company, contact, opportunity, proposals, enquiries, and other records.'],
],[1.5,5.2])
doc.add_heading('5.1 Notes', level=2)
doc.add_paragraph('The note composer is always available in the detail view. Notes do not require a stage transition. Enter only the useful conversation or outcome text; automated boilerplate is not added. Imported Zoho notes retain the original creator and creation time when supplied.')
figure('timeline','Figure 4  Notes and follow-up timeline with user and stage context',3.9)
doc.add_heading('5.2 History', level=2)
doc.add_paragraph('History is the audit narrative for the record. It records the date and time, action, user, changed values, and user-entered note. Examples include record creation, owner changes, field edits, task creation or completion, meeting logging, stage movement, conversion, and proposal revisions.')
lead('User-entered values.', 'Notes, task titles, and changed values use distinct styling from system labels so the audit story remains readable.')

doc.add_heading('6 Follow-ups tasks and meetings', level=1)
doc.add_heading('6.1 Add a follow-up', level=2)
number('Open an eligible lead or opportunity and select Add follow-up.')
number('Enter the follow-up date and time. The combined date-time control remains editable until saved.')
number('Enter a specific follow-up action, such as “Confirm management availability.”')
number('Save. A new task is created in the same stage; existing tasks are not replaced.')
lead('Multiple follow-ups.', 'A stage can contain several follow-up tasks. Each task has its own title, due date, owner, status, note, and history event.')
doc.add_heading('6.2 Close tasks', level=2)
doc.add_paragraph('Use Close in the task row and record the outcome. During a stage transition, answer whether open tasks should be closed; if Yes, select the exact tasks from the table. Never close unrelated future tasks only to clear the modal.')
figure('tasks','Figure 5  Follow-up tasks with due date record and close action',6.75)
doc.add_heading('6.3 Log a meeting', level=2)
number('Select Log Meeting beside Add follow-up.')
number('Choose Scheduled or Completed.')
number('Select Online or Offline and enter the date, time, location or link, outcome, and note as applicable.')
number('Select participants using the searchable multi-select dropdown.')
number('Save. The meeting is stored as an Activity and appears in History and the pending or completed activity views.')
figure('participants','Figure 6  Searchable participant selector for meetings',4.8)
page()

doc.add_heading('7 Enquiries and duplicate leads', level=1)
doc.add_paragraph('The phone number is the duplicate validator for leads. The system keeps repeated customer interest without creating unnecessary duplicate active leads.')
table(['Existing lead state','System result'],[
['Active lead','Create an Enquiry linked to the existing lead. Do not create another lead.'],['Converted lead','Create a new lead and retain the enquiry relationship.'],['Junk Lead or Lead Lost','Create a new lead and retain the enquiry relationship.'],
],[2.2,4.5])
bullet('The lead receives a repeated-enquiry tag visible in list and detail views.')
bullet('The Related tab shows enquiry details inside the lead panel; selecting it does not redirect to a separate page.')
bullet('An enquiry stores the phone, email, source, received date, status, note, Zoho CRM ID, and linked lead.')

doc.add_heading('8 Companies and contacts', level=1)
doc.add_heading('8.1 Company master', level=2)
doc.add_paragraph('A company represents the B2B customer account. One company can have multiple contacts and opportunities. Website is mandatory and unique when a company is created during conversion.')
table(['Company field','Guideline'],[
['Name','Use the legal or commonly recognized business name.'],['Website','Mandatory and unique. Use a valid URL.'],['Industry','Choose or enter the most useful reporting category.'],['Company email and phone','Use general organization contact details.'],['GST or tax number','Enter when available and verified.'],['Relationship','Prospect Customer Partner or Inactive.'],
],[2.0,4.7])
doc.add_heading('8.2 Contact master', level=2)
doc.add_paragraph('A contact represents an employee or stakeholder at a company. Phone is mandatory and is the uniqueness validator during conversion. Record designation and decision-maker status when known.')
doc.add_heading('8.3 Conversion from lead', level=2)
number('From Discovery completed, select Converted.')
number('Choose an existing company from the dropdown, or select Add new company below it.')
number('Choose an existing contact, or add a new contact. Company website and contact phone are validated for uniqueness.')
number('Confirm the opportunity name, owner, and solution context, then save.')
lead('Result.', 'The lead becomes read-only for lead-stage work and the linked opportunity opens the deal pipeline.')

doc.add_heading('9 Opportunity management', level=1)
doc.add_paragraph('Opportunities manage professional solution planning, commercial proposals, negotiation, and closure. The opportunity path is controlled like the lead path.')
table(['Current stage','Permitted next stages'],[
['Solution planning','Proposal preparation; Closed lost'],['Proposal preparation','Proposal sent; Closed lost'],['Proposal sent','Proposal preparation for a new revision; Negotiation; Accepted; Closed lost'],['Negotiation','Accepted; Closed lost'],['Accepted or Closed lost','No further stage movement'],
],[2.15,4.55])
table(['Stage','Key required information'],[
['Solution planning','Solution scope and relevant Zoho products.'],['Proposal preparation','Proposal scope and preparation due date; amount is optional.'],['Proposal sent','Proposal document, currency, proposal amount, sent date, and note.'],['Negotiation','Negotiation date, open points, current amount, and note.'],['Accepted','Accepted proposal revision, acceptance date, agreed amount, advance received, paid date, currency, and acceptance reference when available.'],['Closed lost','Closure date and loss reason.'],
],[2.0,4.7])
lead('Discovery findings.', 'The opportunity displays the original discovery content as Discovery findings. Negotiation notes should not relabel or duplicate it.')
page()

doc.add_heading('10 Proposals and revisions', level=1)
doc.add_paragraph('A proposal may be revised and sent several times. Each Proposal sent transition creates a retained revision rather than replacing the previous file.')
number('Move the opportunity to Proposal preparation and record the scope and due date.')
number('Move to Proposal sent. Upload the proposal document and enter the amount, currency, sent date, and note.')
number('If a revision is required, return to Proposal preparation. Enter the reason for preparing the proposal again.')
number('Upload and send the next revision. The system records the repeat transition for reporting.')
number('At Accepted, choose the exact client-accepted revision from the dropdown.')
figure('proposal','Figure 7  Proposal upload follow-up and open-task controls',4.7)
lead('Document handling.', 'PDF, Word, Excel, and PowerPoint files up to the displayed upload limit are accepted. Earlier proposal revisions remain available. Use a clear revision reference and do not reuse the same revision name for different documents.')

doc.add_heading('11 Activities invoices and implementation', level=1)
doc.add_heading('11.1 Activities', level=2)
doc.add_paragraph('Activities store meetings and other work. Pending meetings and tasks appear in compact tables; completed activities appear with notes and history. Use Meeting status, Online or Offline mode, and participants rather than duplicating company, contact, lead, or stage fields already supplied by the linked record.')
doc.add_heading('11.2 Invoices', level=2)
doc.add_paragraph('Invoice entry is manual in the current phase. Record the invoice number, title, invoice date, amount, paid amount, due date, status, reference number when applicable, and notes. Payment status must agree with the paid amount.')
table(['Status','Validation'],[
['Unpaid','Paid amount must be zero.'],['Part paid','Paid amount must be greater than zero and less than the invoice amount.'],['Paid','Paid amount must equal the invoice amount.'],
],[1.7,5.0])
doc.add_heading('11.3 Implementation', level=2)
doc.add_paragraph('Implementation records track delivery after commercial closure. Link the company and accepted opportunity, assign an owner, record scope, dates, status, and delivery notes. Keep project delivery activity separate from sales follow-up tasks.')

doc.add_heading('12 Overview dashboards and reporting', level=1)
doc.add_paragraph('Overview presents the lead-to-accepted conversion matrix first, followed by pipeline and stage performance. Filters use an explicit Apply button and default to the current month.')
table(['Report','Interpretation'],[
['Lead conversion matrix','Horizontal funnel from New Lead through lead and opportunity stages to Accepted. Counts and percentages use the selected period.'],['Pipeline','Open opportunities grouped by current stage and amount.'],['Average stage time','Average elapsed time between recorded stage changes, such as New Lead to Not Contacted.'],['Last-month comparison','Compares the selected period with the previous month when both periods have data.'],['Reproposal activity','Counts returns from Proposal sent to Proposal preparation and preserves the reason note.'],
],[2.0,4.7])
lead('Date accuracy.', 'Zoho-originated records retain Zoho CRM created time separately from OHO CRM created time. Reports based on acquisition should use the Zoho created time when specified; operational workload reports may use the OHO creation or assignment time.')

doc.add_heading('13 Administration and permissions', level=1)
doc.add_paragraph('Access combines role hierarchy and profile permissions. The current hierarchy is Admin, Manager, and Executive. An upper role can see subordinate data; a user cannot automatically see peer or higher-role data.')
table(['Control','Purpose'],[
['Role','Defines position in the data-visibility hierarchy.'],['Profile or permission set','Defines create, view, edit, and delete rights for each module.'],['User','Stores email, name, role, profile, and active status.'],['Module permission','Applies the profile’s rights to a specific module.'],
],[2.0,4.7])
number('Create or review the role hierarchy.')
number('Create a permission set or profile with module-level rights.')
number('Add the user’s email and name, then assign both role and profile.')
number('Activate the user and test access using that email.')
lead('Safe permission practice.', 'Give delete and administration rights only where required. Deactivate former users rather than reusing their email identity.')
page()

doc.add_heading('14 Imports integrations and errors', level=1)
doc.add_heading('14.1 Zoho CRM lead intake', level=2)
doc.add_paragraph('Zoho CRM is an intake source. New Zoho leads are synchronized to OHO CRM on the configured schedule. The integration is add-only for ordinary incremental sync so OHO ownership, stages, notes, and tasks remain protected. CSV reconciliation may be used by an administrator for controlled status corrections.')
bullet('Zoho CRM ID prevents duplicate imports.')
bullet('Zoho Created Time is stored separately and used where source-time reporting is required.')
bullet('Lead source and reason dropdown values are retained when recognized.')
bullet('Phone remains mandatory. Records without a phone require correction before lead creation.')
doc.add_heading('14.2 Notes migration', level=2)
doc.add_paragraph('Migrated notes are matched by Zoho CRM lead ID, not by name. The note content, creator, created time, modifier, and modified time are preserved when available. Unmatched notes must wait until the parent lead exists in OHO CRM.')
doc.add_heading('14.3 Integration Errors', level=2)
doc.add_paragraph('The Integration Errors module stores the integration name, operation, status, error message, occurrence time, technical context, and resolution time. Administrators should resolve the underlying issue, rerun only the failed scope, and mark the error Resolved with a clear resolution note.')
lead('External communication.', 'The current development configuration must not send email or other external communication unless that integration is explicitly approved and enabled.')

doc.add_heading('15 Data quality and operating standards', level=1)
table(['Standard','Expected practice'],[
['Ownership','Assign every active record to the employee responsible for the next action.'],['Notes','Write concise facts, outcome, and next commitment. Avoid copied boilerplate.'],['Dates','Use the actual event or commitment date. Times are IST unless stated otherwise.'],['Stages','Move only when the stage definition is satisfied; do not use stages as reminders.'],['Tasks','Create a separate task for each distinct follow-up. Close only completed or cancelled work.'],['Meetings','Log scheduled and completed meetings as Activities with participants and mode.'],['Companies','Use a unique valid website and one company master per B2B account.'],['Contacts','Use a valid unique phone and link the contact to the correct company.'],['Proposals','Create a new revision for each materially different proposal and record the revision reason.'],['Terminal outcomes','Use Junk Lead, Lead Lost, or Closed lost with a meaningful reason; do not delete operational history.'],
],[1.65,5.05])

doc.add_heading('16 Troubleshooting', level=1)
table(['Message or symptom','What to do'],[
['Email is not an active CRM user','Check the email spelling. Ask an administrator to add or reactivate the user and assign role and profile.'],['This record changed Refresh it before saving','Another update changed the record version. Refresh, reopen the record, confirm the latest values, and retry.'],['The server returned an incomplete response','Refresh records once. If repeated, capture the time, user, module, record, and action in Integration Errors.'],['Use the transaction path for this change','The operation affects related or protected data. Use the normal application action rather than editing datastore rows directly.'],['Save feels slow','Wait for the visible loader. Avoid double-clicking. Large first loads use pagination and server-side summaries.'],['A task is missing from Home','Check owner, due date and time, status, and the applied date range. Meetings may appear as Activities linked to a record.'],['A lead row reloads repeatedly','Allow the first detail load to finish. Returning to an already loaded tab should use cached data unless records were refreshed.'],['Follow-up date is disabled','Close and reopen the modal. Confirm the follow-up answer is Yes and the record is in an eligible stage.'],['Proposal revision is missing','Confirm the document upload completed and the opportunity remains linked to the correct proposal.'],['Imported note is missing','Confirm the lead’s Zoho CRM ID matches the parent ID in the notes export.'],
],[2.35,4.35])
lead('Escalation details.', 'Provide the user email, record name or ID, module, action, exact message, and approximate IST time. Never include passwords, API keys, or OAuth tokens in support notes.')

doc.add_heading('17 Quick reference', level=1)
doc.add_heading('17.1 Daily checklist', level=2)
bullet('Open Home and apply today’s task filter.')
bullet('Complete or reschedule overdue tasks with an outcome note.')
bullet('Review leads added or assigned today and take the first valid action.')
bullet('Progress open opportunities and check proposal due dates.')
bullet('Log meetings and participants on the correct linked record.')
bullet('Before signing out, confirm every customer commitment has a task or scheduled meeting.')
doc.add_heading('17.2 Mandatory rules', level=2)
table(['Item','Rule'],[
['Lead phone','Mandatory'],['Lead contact field','Not required'],['Lead estimated value','Not used'],['Company website','Mandatory and unique during conversion'],['Contact phone','Mandatory and uniqueness validator'],['Proposal amount','Mandatory at Proposal sent'],['Proposal note','Mandatory at Proposal sent'],['Accepted deal','Accepted revision, agreed amount, advance amount, paid date, and currency required'],['Currencies','INR AED USD SAR QAR'],['Follow-up in New Lead','Disabled'],['Voice calling','Excluded from this manual'],
],[2.4,4.3])
doc.add_heading('17.3 Lead stage definitions', level=2)
table(['Stage','Meaning'],[
['New Lead','Newly received and not yet worked.'],['Not Contacted','A contact attempt was made without a successful conversation.'],['Not Pitched','Contact occurred but the solution was not yet pitched.'],['Followup Later','Customer or team agreed to continue at a future time.'],['Discovery to be Scheduled','Contact is established; discovery details and availability are being arranged.'],['Discovery scheduled','Discovery meeting date, time, mode, and location are fixed.'],['Discovery completed','Requirements and findings are confirmed; ready for conversion.'],['Converted','Lead created an opportunity.'],['Junk Lead','Invalid or irrelevant enquiry.'],['Lead Lost','Valid enquiry that will not proceed.'],
],[2.25,4.45])

# Footer
for section in doc.sections:
    footer=section.footer
    p=footer.paragraphs[0]; p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    r=p.add_run('OHO CRM User Manual   |   OHO Solutions   |   Page '); r.font.size=Pt(8); r.font.color.rgb=RGBColor(95,108,114)
    field(p.add_run(), 'PAGE')

# Keep headings with content and prevent widows where possible
for p in doc.paragraphs:
    if p.style.name.startswith('Heading'):
        p.paragraph_format.keep_with_next=True
    if p.style.name == 'Title':
        pPr = p._p.get_or_add_pPr()
        pBdr = pPr.find(qn('w:pBdr'))
        if pBdr is not None:
            pPr.remove(pBdr)
    p.paragraph_format.widow_control=True

doc.core_properties.title='OHO CRM User Manual'
doc.core_properties.subject='User and administrator guide for OHO Solutions CRM'
doc.core_properties.author='OHO Solutions'
doc.save(OUT)
print(OUT)
