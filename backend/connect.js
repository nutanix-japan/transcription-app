deepgramConnection = deepgram.listen.live({
    model: "nova-2",
    language: "en-US",
    smart_format: true,
    interim_results: false,
    punctuate: true,
    encoding: "linear16",
    channels: 1,
    sample_rate: 16000,
    endpointin: 100,
  });