import random, os
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
import docx
from docx.shared import Pt
from PIL import Image, ImageDraw, ImageFont, ImageFilter
OUT='/home/claude/demo-kit/resumes/'
P=[
 dict(f='01 Rohan Mehta.pdf', name='Rohan Mehta', title='Senior Backend Engineer', email='rohan.mehta.demo@example.com', phone='+91 98201 11001', loc='Goregaon East, Mumbai',
  summary='6.5 years building payment and lending microservices in Java and Spring Boot for fintech products.',
  ctc='Current CTC: 18 LPA | Expected CTC: 23 LPA | Notice period: 30 days',
  skills='Java, Spring Boot, Microservices, SQL, PostgreSQL, Kafka, Docker, AWS, REST',
  exp=[('Example Pay Pvt Ltd','Senior Backend Engineer','Jun 2021 - Present',['Own the UPI collections service handling 2M requests a day','Split a Spring monolith into 9 microservices on AWS','Introduced Kafka for settlement events']),
       ('Example Softech','Software Engineer','Jul 2018 - May 2021',['Built REST APIs for partner banks in Java 11','Tuned slow SQL queries on PostgreSQL'])],
  edu='B.E. Computer Engineering, University of Mumbai, 2018'),
 dict(f='02 Priya Nair.docx', name='Priya Nair', title='Java Developer', email='priya.nair.demo@example.com', phone='+91 98201 11002', loc='Andheri West, Mumbai',
  summary='5 years of Java and Spring Boot development across insurance and banking projects.',
  ctc='Current CTC: 15 LPA | Expected CTC: 21 LPA | Notice period: 15 days',
  skills='Java, Spring Boot, Microservices, SQL, MySQL, Hibernate, AWS, Jenkins',
  exp=[('Example Insure Tech','Java Developer','Aug 2022 - Present',['Built claims microservices in Spring Boot','Deployed services on AWS ECS with Jenkins pipelines']),
       ('Example Bank IT Services','Associate Developer','Jul 2020 - Jul 2022',['Maintained core banking modules in Java and SQL'])],
  edu='B.Tech Information Technology, VJTI Mumbai, 2020'),
 dict(f='03 Arjun Kulkarni.pdf', name='Arjun Kulkarni', title='Technical Lead', email='arjun.kulkarni.demo@example.com', phone='+91 98201 11003', loc='Hinjewadi, Pune',
  summary='9 years in Java, last 3 leading a team of 8. Looking for architect roles.',
  ctc='Current CTC: 28 LPA | Expected CTC: 36 LPA | Notice period: 90 days',
  skills='Java, Spring Boot, Microservices, Kafka, AWS, Kubernetes, System Design',
  exp=[('Example Global Services','Technical Lead','2022 - Present',['Lead a team of 8 engineers on a trading platform','Designed event-driven architecture on Kafka and Kubernetes']),
       ('Example Systems','Senior Engineer','2016 - 2022',['Java services for retail banking'])],
  edu='B.E. Computer Science, Pune University, 2016'),
 dict(f='05 Fatima Shaikh.docx', name='Fatima Shaikh', title='Data Engineer', email='fatima.shaikh.demo@example.com', phone='+91 98201 11005', loc='Kurla, Mumbai',
  summary='4 years building data pipelines in Python and Spark for analytics teams.',
  ctc='Current CTC: 14 LPA | Expected CTC: 19 LPA | Notice period: 30 days',
  skills='Python, Spark, Airflow, SQL, Snowflake, AWS',
  exp=[('Example Analytics','Data Engineer','2021 - Present',['Batch and streaming pipelines on Spark and Airflow','Modelled the warehouse in Snowflake'])],
  edu='B.Sc. Computer Science, Mumbai University, 2020'),
 dict(f='07 Priya Nair - updated resume.pdf', name='Priya Nair', title='Java Developer', email='priya.nair.demo@example.com', phone='+91 98201 11002', loc='Andheri West, Mumbai',
  summary='5.5 years of Java and Spring Boot development. Recently added Kafka and Docker to production work.',
  ctc='Current CTC: 15 LPA | Expected CTC: 21 LPA | Notice period: 15 days',
  skills='Java, Spring Boot, Microservices, SQL, MySQL, Kafka, Docker, AWS, Jenkins',
  exp=[('Example Insure Tech','Java Developer','Aug 2022 - Present',['Built claims microservices in Spring Boot','Moved policy events to Kafka, containerised with Docker']),
       ('Example Bank IT Services','Associate Developer','Jul 2020 - Jul 2022',['Maintained core banking modules in Java and SQL'])],
  edu='B.Tech Information Technology, VJTI Mumbai, 2020'),
]
def text_of(p):
  L=[p['name'],p['title'],f"Email: {p['email']}  |  Phone: {p['phone']}",f"Location: {p['loc']}",'', 'SUMMARY',p['summary'],p['ctc'],'', 'SKILLS',p['skills'],'', 'EXPERIENCE']
  for co,role,when,bul in p['exp']:
    L.append(f'{role}, {co}  ({when})'); L+= ['- '+b for b in bul]
  L+=['','EDUCATION',p['edu']]
  return L
def pdf(p):
  c=canvas.Canvas(OUT+p['f'],pagesize=A4); W,H=A4; y=H-60
  c.setFillColor(HexColor('#06142e')); c.setFont('Helvetica-Bold',20); c.drawString(50,y,p['name']); y-=20
  c.setFont('Helvetica',11); c.setFillColor(HexColor('#2f74d0')); c.drawString(50,y,p['title']); y-=16
  c.setFillColor(HexColor('#333333')); c.setFont('Helvetica',9.5)
  for l in text_of(p)[2:]:
    if l in ('SUMMARY','SKILLS','EXPERIENCE','EDUCATION'):
      y-=6; c.setFont('Helvetica-Bold',10.5); c.setFillColor(HexColor('#06142e')); c.drawString(50,y,l); c.setFont('Helvetica',9.5); c.setFillColor(HexColor('#333333')); y-=4; c.line(50,y,545,y); y-=12; continue
    c.drawString(50,y,l); y-=14
  c.save()
def dx(p):
  d=docx.Document(); d.add_heading(p['name'],0); d.add_paragraph(p['title'])
  for l in text_of(p)[2:]:
    if l in ('SUMMARY','SKILLS','EXPERIENCE','EDUCATION'): d.add_heading(l.title(),2)
    elif l.startswith('- '): d.add_paragraph(l[2:], style='List Bullet')
    elif l: d.add_paragraph(l)
  d.save(OUT+p['f'])
for p in P: (pdf if p['f'].endswith('.pdf') else dx)(p)
# 04 plain text
sneha=dict(name='Sneha Iyer',title='Software Engineer',email='sneha.iyer.demo@example.com',phone='+91 98201 11004',loc='Thane West',
 summary='3 years of Java and Spring Boot. Keen to move into microservices.',ctc='Current CTC: 9 LPA | Expected CTC: 13 LPA | Notice period: 30 days',
 skills='Java, Spring Boot, SQL, Hibernate, Git',exp=[('Example IT Solutions','Software Engineer','2022 - Present',['REST APIs in Spring Boot for an HR product','Unit tests with JUnit and Mockito'])],edu='B.E. Electronics, Mumbai University, 2022')
open(OUT+'04 Sneha Iyer.txt','w').write('\n'.join(text_of(sneha)))
# 06 scanned photo (needs AI to read)
vik=dict(name='Vikram Singh',title='Senior Java Engineer',email='vikram.singh.demo@example.com',phone='+91 98201 11006',loc='Vashi, Navi Mumbai',
 summary='7 years in Java, Spring Boot and microservices for e-commerce at scale.',ctc='Current CTC: 20 LPA | Expected CTC: 24 LPA | Notice period: 30 days',
 skills='Java, Spring Boot, Microservices, SQL, Redis, Kafka, Docker',exp=[('Example Commerce','Senior Java Engineer','2020 - Present',['Checkout and inventory microservices','Redis caching cut p95 latency in half']),('Example Retail Tech','Developer','2018 - 2020',['Order management in Java'])],edu='B.Tech Computer Science, NIT, 2018')
img=Image.new('RGB',(1240,1754),(250,248,243)); g=ImageDraw.Draw(img)
fb=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',44); fr=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',26)
y=110; g.text((110,y),vik['name'],font=fb,fill=(20,20,20)); y+=70
for l in text_of(vik)[1:]:
  g.text((110,y),l,font=fr,fill=(35,35,35)); y+=40
img=img.rotate(-1.2,expand=False,fillcolor=(235,233,228)).filter(ImageFilter.GaussianBlur(0.6))
px=img.load(); random.seed(3)
for _ in range(60000):
  x,yy=random.randrange(1240),random.randrange(1754); c=random.randint(200,240); px[x,yy]=(c,c,c-5)
img.save(OUT+'06 Vikram Singh (phone scan).jpg',quality=82)
# 08 RTF
rtf='{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Calibri;}}\\f0\\fs22 '+'\\par '.join(l.replace('\\','') for l in text_of(dict(name='Karan Desai',title='Lead Java Developer',email='karan.desai.demo@example.com',phone='+91 98201 11008',loc='Borivali West, Mumbai',
 summary='8 years of Java, Spring Boot and microservices; led a team of 5 on a lending platform.',ctc='Current CTC: 26 LPA | Expected CTC: 30 LPA | Notice period: 60 days',
 skills='Java, Spring Boot, Microservices, SQL, Kafka, AWS, Docker, Kubernetes',exp=[('Example Lending','Lead Java Developer','2021 - Present',['Led 5 engineers on loan origination services','Kafka-based credit decision pipeline']),('Example Infotech','Senior Developer','2016 - 2021',['Java services for NBFC clients'])],edu='B.E. Computer Engineering, Mumbai University, 2016')))+'}'
open(OUT+'08 Karan Desai.rtf','w').write(rtf)
print(sorted(os.listdir(OUT)))
