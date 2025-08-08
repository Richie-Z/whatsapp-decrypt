export interface CallLog {
  _id: number;
  jid: string;
  call_id: string;
  transaction_id?: string;
  from_me: number;
  video_call: number;
  created_timestamp: number;
  group_call: number;
  call_result: number;
  is_call_link: number;
  call_link_row_id?: number;
  scheduled_call_row_id?: number;
  call_creator_device_jid?: string;
  group_call_participant_count?: number;
  call_randomly_generated_id?: string;
}
