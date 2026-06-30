import os
import smtplib
import imaplib
import email
from email.header import decode_header
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# ────────────────────────────────────────────────────────
# FEATURE 1: WHATSAPP MESSAGES (with SMS fallback)
# ────────────────────────────────────────────────────────

def format_phone_number(phone):
    if not phone:
        return ""
    # Strip spaces, dashes, parentheses
    cleaned = "".join(c for c in phone if c.isdigit() or c == "+")
    if not cleaned:
        return phone
        
    if not cleaned.startswith("+"):
        # If it starts with 91 and is 12 digits, prepend +
        if len(cleaned) == 12 and cleaned.startswith("91"):
            return "+" + cleaned
        # If it starts with 1 and is 11 digits, prepend +
        elif len(cleaned) == 11 and cleaned.startswith("1"):
            return "+" + cleaned
        # If it is 10 digits, default to India (+91)
        elif len(cleaned) == 10:
            return "+91" + cleaned
        else:
            # Fallback: prepend + if it looks like it might have a country code, otherwise prepend +91
            if len(cleaned) > 10:
                return "+" + cleaned
            else:
                return "+91" + cleaned
    return cleaned

def send_whatsapp_action(recipient, message):
    import platform
    if platform.system() == "Darwin":
        try:
            import subprocess
            import time
            from backend.actions import open_whatsapp
            
            # 1. Bring WhatsApp/Browser to front
            open_whatsapp()
            time.sleep(3.0)
            
            script = f'''
            tell application "System Events"
                set whatsappRunning to false
                if exists (process "WhatsApp") then
                    set frontmost of process "WhatsApp" to true
                    set whatsappRunning to true
                else if exists (process "Google Chrome") then
                    set frontmost of process "Google Chrome" to true
                else if exists (process "Safari") then
                    set frontmost of process "Safari" to true
                end if
                
                delay 1.0
                
                # Try focus search bar: Cmd + Alt + /
                keystroke "/" using {{command down, option down}}
                delay 0.5
                
                # Backup: Cmd + F
                keystroke "f" using {{command down}}
                delay 0.3
                
                # Select all and Backspace to clear search bar
                keystroke "a" using {{command down}}
                delay 0.2
                key code 51
                delay 0.2
                
                # Type recipient name / phone
                keystroke "{recipient}"
                delay 2.5 # Wait for search results
                
                # Down arrow to highlight first search result
                key code 125
                delay 0.5
                
                # Enter to open chat
                key code 36
                delay 0.8
                
                # Type message
                keystroke "{message}"
                delay 0.5
                
                # Enter to send
                key code 36
            end tell
            '''
            
            subprocess.run(["osascript", "-e", script], check=True)
            return f"WhatsApp message GUI automation completed for {recipient}, Sir."
        except Exception as e:
            return f"WhatsApp GUI automation failed, Sir. Error: {str(e)}"
    else:
        # Non-mac fallback: use pywhatkit
        try:
            import pywhatkit
            formatted_phone = format_phone_number(recipient)
            pywhatkit.sendwhatmsg_instantly(formatted_phone, message, 15, True)
            return f"WhatsApp message initiated to {formatted_phone}, Sir."
        except Exception as e:
            return f"WhatsApp failed: {str(e)}."

# ────────────────────────────────────────────────────────
# FEATURE 2: EMAIL SENDING via SMTP
# ────────────────────────────────────────────────────────

def send_email_action(recipient_email, message_content):
    sender = os.getenv("SENDER_EMAIL")
    password = os.getenv("SENDER_PASSWORD")
    
    if not sender or not password:
        return "I cannot send emails because the SENDER_EMAIL or SENDER_PASSWORD is not configured in your environment, Sir."
        
    try:
        msg = MIMEMultipart()
        msg['From'] = sender
        msg['To'] = recipient_email
        
        # Auto-generate subject
        clean_msg = message_content.strip()
        subject_snippet = clean_msg[:30] + "..." if len(clean_msg) > 30 else clean_msg
        msg['Subject'] = f"Message from Jarvis: {subject_snippet}"
        
        msg.attach(MIMEText(message_content, 'plain'))
        
        # Connect to Gmail SMTP
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(sender, password)
        server.sendmail(sender, recipient_email, msg.as_string())
        server.quit()
        
        return f"Email sent successfully to {recipient_email}, Sir."
    except Exception as e:
        return f"Failed to send email to {recipient_email}, Sir. Error: {str(e)}"

# ────────────────────────────────────────────────────────
# FEATURE 3: READ MESSAGES / EMAILS via IMAP
# ────────────────────────────────────────────────────────

def read_latest_emails():
    sender = os.getenv("SENDER_EMAIL")
    password = os.getenv("SENDER_PASSWORD")
    
    if not sender or not password:
        return "I cannot read your emails because SENDER_EMAIL or SENDER_PASSWORD is not configured in your environment, Sir."
        
    try:
        # Connect to Gmail IMAP
        mail = imaplib.IMAP4_SSL("imap.gmail.com")
        mail.login(sender, password)
        mail.select("inbox")
        
        # Search for UNREAD (UNSEEN) emails
        status, response = mail.search(None, 'UNSEEN')
        mail_ids = response[0].split()
        
        if not mail_ids:
            mail.close()
            mail.logout()
            return "You have no unread emails in your inbox, Sir."
            
        # Fetch the last 3 unread emails
        latest_ids = mail_ids[-3:]
        latest_ids.reverse() # Process most recent first
        
        email_summaries = []
        for idx, mail_id in enumerate(latest_ids):
            status, data = mail.fetch(mail_id, '(RFC822)')
            raw_email = data[0][1]
            msg = email.message_from_bytes(raw_email)
            
            # Decode Subject
            subject, encoding = decode_header(msg["Subject"])[0]
            if isinstance(subject, bytes):
                subject = subject.decode(encoding or "utf-8", errors="ignore")
                
            # Decode From
            from_sender, encoding = decode_header(msg["From"])[0]
            if isinstance(from_sender, bytes):
                from_sender = from_sender.decode(encoding or "utf-8", errors="ignore")
                
            # Clean up sender representation slightly
            if "<" in from_sender:
                from_sender = from_sender.split("<")[0].strip()
                
            email_summaries.append(f"Email {idx+1} from {from_sender}, regarding: {subject}.")
            
        mail.close()
        mail.logout()
        
        summaries_text = " ".join(email_summaries)
        return f"I found {len(latest_ids)} unread emails in your inbox, Sir. {summaries_text}"
        
    except Exception as e:
        return f"Failed to retrieve your unread emails, Sir. Error: {str(e)}"

# ────────────────────────────────────────────────────────
# FEATURE 4: SMS Twiliofallback
# ────────────────────────────────────────────────────────

def send_sms_action(recipient_phone, message_content):
    formatted_phone = format_phone_number(recipient_phone)
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    twilio_phone = os.getenv("TWILIO_PHONE_NUMBER")
    
    if not account_sid or not auth_token or not twilio_phone:
        return "Twilio SMS credentials are not fully configured in your environment, Sir."
        
    try:
        from twilio.rest import Client
        client = Client(account_sid, auth_token)
        
        # Send SMS
        client.messages.create(
            body=message_content,
            from_=twilio_phone,
            to=formatted_phone
        )
        return f"SMS text message sent successfully to {formatted_phone}, Sir."
    except Exception as e:
        return f"Failed to send Twilio SMS, Sir. Error: {str(e)}"
